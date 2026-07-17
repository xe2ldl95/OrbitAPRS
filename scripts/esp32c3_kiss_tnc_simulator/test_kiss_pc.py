"""
Test KISS desde PC (sin ESP32) usando un puerto serial loopback
o para verificar la salida de un ESP32.

Uso:
  python test_kiss_pc.py COM5

Envía un frame KISS y espera respuesta.
Usa CTRL+C para salir.
"""
import sys
import time
import serial

FEND = b'\xC0'
FESC = b'\xDB'
TFEND = b'\xDC'
TFESC = b'\xDD'


def kiss_encode(cmd, data):
    buf = bytearray()
    buf.append(FEND[0])
    buf.append(cmd)
    for b in data:
        if b == FEND[0]:
            buf.extend(FESC + TFEND)
        elif b == FESC[0]:
            buf.extend(FESC + TFESC)
        else:
            buf.append(b)
    buf.append(FEND[0])
    return bytes(buf)


def kiss_decode(stream):
    frames = []
    in_frame = False
    escaped = False
    buf = bytearray()
    for b in stream:
        if escaped:
            escaped = False
            if b == TFEND[0]:
                b = FEND[0]
            elif b == TFESC[0]:
                b = FESC[0]
            else:
                in_frame = False
                buf.clear()
                continue
            buf.append(b)
        elif b == FESC[0]:
            escaped = True
        elif b == FEND[0]:
            if in_frame and len(buf) > 0:
                frames.append((buf[0], bytes(buf[1:])))
            in_frame = True
            buf.clear()
        else:
            buf.append(b)
    return frames


def main():
    if len(sys.argv) < 2:
        print(f"Uso: {sys.argv[0]} <puerto> [baud]")
        print(f"Ej: {sys.argv[0]} COM5 38400")
        sys.exit(1)

    port = sys.argv[1]
    baud = int(sys.argv[2]) if len(sys.argv) > 2 else 38400

    try:
        ser = serial.Serial(port, baud, timeout=1)
    except Exception as e:
        print(f"Error abriendo {port}: {e}")
        sys.exit(1)

    print(f"Conectado a {port} @ {baud} baud")
    print("Enviando frame de prueba KISS...")

    # Enviar un paquete APRS de prueba
    test_data = b"XE2LDL>APRS,WIDE1-1:!3132.00N/12112.00W-Test"
    frame = kiss_encode(0x00, test_data)
    ser.write(frame)
    print(f"Enviado: {frame.hex(' ')}")

    # Leer respuestas
    print("Esperando respuesta...")
    buffer = bytearray()
    start = time.time()
    while time.time() - start < 5:
        if ser.in_waiting:
            data = ser.read(ser.in_waiting)
            buffer.extend(data)
            frames = kiss_decode(data)
            for cmd, payload in frames:
                try:
                    text = payload.decode('ascii', errors='replace')
                except:
                    text = payload.hex(' ')
                print(f"  Recibido cmd=0x{cmd:02X} len={len(payload)}: {text}")
            start = time.time()  # reset timeout on data
        else:
            time.sleep(0.05)

    ser.close()
    print("Done.")


if __name__ == '__main__':
    main()
