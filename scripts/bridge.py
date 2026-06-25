#!/usr/bin/env python3
"""Puente WebSocket ↔ TCP KISS para OrbitAPRS.
Mantiene conexion TCP persistente a Dire Wolf.
Bufferiza datos entre reconexiones del WebSocket.

Variables de entorno:
  DIREWOLF_HOST (default: 127.0.0.1)
  DIREWOLF_PORT (default: 8001)
  WS_HOST       (default: 0.0.0.0)
  WS_PORT       (default: 8102)
"""

import asyncio
import hashlib
import base64
import os
import signal
import struct
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S'
)
log = logging.getLogger('bridge')

DIREWOLF_HOST = os.environ.get('DIREWOLF_HOST', '127.0.0.1')
DIREWOLF_PORT = int(os.environ.get('DIREWOLF_PORT', '8001'))
WS_HOST = os.environ.get('WS_HOST', '0.0.0.0')
WS_PORT = int(os.environ.get('WS_PORT', '8102'))
MAX_BUF = 256 * 1024

WS_MAGIC = b'258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

OP_CONT = 0x0
OP_TEXT = 0x1
OP_BIN = 0x2
OP_CLOSE = 0x8
OP_PING = 0x9
OP_PONG = 0xA


def ws_encode(data, opcode=OP_BIN):
    frames = bytearray()
    i = 0
    while i < len(data):
        chunk = data[i:i + 65535]
        i += len(chunk)
        fin = 0x80 if i >= len(data) else 0x00
        frames.append(fin | opcode)
        if len(chunk) < 126:
            frames.append(len(chunk))
        elif len(chunk) < 65536:
            frames.append(126)
            frames.extend(struct.pack('>H', len(chunk)))
        else:
            frames.append(127)
            frames.extend(struct.pack('>Q', len(chunk)))
        frames.extend(chunk)
    return bytes(frames)


async def ws_read(reader, n):
    data = await reader.readexactly(n)
    return data

async def ws_decode_frame(reader):
    b1 = await ws_read(reader, 1)
    b2 = await ws_read(reader, 1)
    opcode = b1[0] & 0x0F
    masked = b2[0] & 0x80
    length = b2[0] & 0x7F
    if length == 126:
        length = struct.unpack('>H', await ws_read(reader, 2))[0]
    elif length == 127:
        length = struct.unpack('>Q', await ws_read(reader, 8))[0]
    mask = None
    if masked:
        mask = await ws_read(reader, 4)
    payload = await ws_read(reader, length)
    if mask:
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    return opcode, payload


async def ws_handshake(reader, writer):
    data = b''
    while b'\r\n\r\n' not in data:
        chunk = await reader.read(4096)
        if not chunk:
            return None
        data += chunk
    header = data.split(b'\r\n\r\n')[0].decode('utf-8', errors='replace')
    key = None
    for line in header.split('\r\n'):
        if line.lower().startswith('sec-websocket-key:'):
            key = line.split(':', 1)[1].strip()
            break
    if not key:
        writer.close()
        return None
    accept = base64.b64encode(
        hashlib.sha1((key + WS_MAGIC.decode()).encode()).digest()
    ).decode()
    writer.write((
        'HTTP/1.1 101 Switching Protocols\r\n'
        'Upgrade: websocket\r\n'
        'Connection: Upgrade\r\n'
        'Sec-WebSocket-Accept: ' + accept + '\r\n'
        '\r\n'
    ).encode())
    await writer.drain()
    return True


async def ws_send(writer, data):
    try:
        writer.write(ws_encode(data))
        await writer.drain()
    except Exception:
        pass


class Bridge:
    def __init__(self):
        self.tcp_reader = None
        self.tcp_writer = None
        self.ws_writer = None
        self.buffer = bytearray()
        self.lock = asyncio.Lock()

    async def connect_tcp(self):
        while True:
            try:
                self.tcp_reader, self.tcp_writer = await asyncio.open_connection(
                    DIREWOLF_HOST, DIREWOLF_PORT
                )
                log.info('TCP conectado a %s:%s', DIREWOLF_HOST, DIREWOLF_PORT)
                asyncio.create_task(self.read_tcp())
                return
            except Exception as e:
                log.error('TCP error: %s, reconectando en 2s...', e)
                await asyncio.sleep(2)

    async def read_tcp(self):
        while True:
            try:
                data = await self.tcp_reader.read(65535)
                if not data:
                    break
                async with self.lock:
                    if self.ws_writer:
                        await ws_send(self.ws_writer, data)
                    else:
                        if len(self.buffer) + len(data) > MAX_BUF:
                            self.buffer = self.buffer[-MAX_BUF + len(data):]
                        self.buffer.extend(data)
            except Exception as e:
                log.error('TCP lectura error: %s', e)
                break
        log.warning('TCP desconectado, reconectando...')
        self.tcp_writer = None
        self.tcp_reader = None
        asyncio.create_task(self.connect_tcp())

    async def handle_ws(self, reader, writer):
        if not await ws_handshake(reader, writer):
            return
        peername = writer.get_extra_info('peername')
        log.info('WebSocket conectado desde %s:%s', *peername)

        async with self.lock:
            self.ws_writer = writer
            if self.buffer:
                log.info('Enviando %d bytes bufferizados', len(self.buffer))
                await ws_send(writer, bytes(self.buffer))
                self.buffer.clear()

        try:
            while True:
                opcode, payload = await ws_decode_frame(reader)
                if opcode == OP_CLOSE:
                    break
                elif opcode == OP_PING:
                    try:
                        writer.write(ws_encode(payload, opcode=OP_PONG))
                        await writer.drain()
                    except Exception:
                        pass
                elif opcode == OP_BIN or opcode == OP_TEXT:
                    if self.tcp_writer:
                        try:
                            self.tcp_writer.write(payload)
                            await self.tcp_writer.drain()
                        except Exception:
                            pass
        except asyncio.IncompleteReadError:
            pass
        except Exception as e:
            log.debug('WS error: %s', e)
        finally:
            log.info('WebSocket desconectado de %s:%s', *peername)
            async with self.lock:
                self.ws_writer = None
            try:
                writer.close()
            except Exception:
                pass

    async def start(self):
        asyncio.create_task(self.connect_tcp())
        server = await asyncio.start_server(self.handle_ws, WS_HOST, WS_PORT)
        log.info('Bridge escuchando WebSocket en puerto %s', WS_PORT)
        async with server:
            await server.serve_forever()


def main():
    bridge = Bridge()
    try:
        asyncio.run(bridge.start())
    except KeyboardInterrupt:
        log.info('Deteniendo...')


if __name__ == '__main__':
    main()
