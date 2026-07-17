/*
  ESP32-C3 Super Mini KISS TNC Simulator
  Para probar OrbitAPRS en Android via USB Serial

  Conexiones ESP32-C3 Super Mini:
    - USB: ya conectado via UART0 (pines D8/D9 integrados en placa)
    - LED: GPIO 12 (algunos modelos) o GPIO 8 (WS2812 RGB)
      Prueba ambos pines si no ves el LED

  KISS protocol:
    FEND  = 0xC0
    FESC  = 0xDB
    TFEND = 0xDC
    TFESC = 0xDD
    Comando 0x00 = Data frame
    Comando 0x06 = Hardware version
*/

// --- Configuración ---
#define LED_PIN 12          // GPIO 12 (LED azul ESP32-C3 Super Mini)
#define LED_ON  HIGH
#define LED_OFF LOW
#define SERIAL_BAUD 38400   // Misma velocidad que OrbitAPRS
#define BEACON_INTERVAL 10000  // Enviar beacon cada 10s

// --- KISS constants ---
#define FEND  0xC0
#define FESC  0xDB
#define TFEND 0xDC
#define TFESC 0xDD
#define CMD_DATA     0x00
#define CMD_HARDWARE 0x06

// --- Buffer ---
uint8_t rxBuf[512];
uint16_t rxLen = 0;
bool inFrame = false;
bool escaped = false;

unsigned long lastBeacon = 0;

// --- KISS decode/encode helpers ---
void kissSendFrame(uint8_t cmd, uint8_t* data, uint16_t len) {
  Serial.write(FEND);
  Serial.write(cmd);
  for (uint16_t i = 0; i < len; i++) {
    if (data[i] == FEND) { Serial.write(FESC); Serial.write(TFEND); }
    else if (data[i] == FESC) { Serial.write(FESC); Serial.write(TFESC); }
    else { Serial.write(data[i]); }
  }
  Serial.write(FEND);
}

void kissSendAPRSBeacon() {
  // APRS position packet: XE2LDL>APRS,WIDE1-1:!3132.00N/12112.00W-Test KISS
  uint8_t packet[] = "XE2LDL>APRS,WIDE1-1:!3132.00N/12112.00W-Test KISS";
  kissSendFrame(CMD_DATA, packet, sizeof(packet) - 1);
}

void kissSendVersion() {
  uint8_t version[] = "ESP32-C3 KISS TNC v1.0";
  kissSendFrame(CMD_HARDWARE, version, sizeof(version) - 1);
}

void blinkLED(int count, int delayMs) {
  for (int i = 0; i < count; i++) {
    digitalWrite(LED_PIN, LED_ON);
    delay(delayMs);
    digitalWrite(LED_PIN, LED_OFF);
    delay(delayMs);
  }
}

// --- Procesar frame KISS recibido ---
void processKISSFrame(uint8_t cmd, uint8_t* data, uint16_t len) {
  if (cmd == CMD_DATA) {
    // Recibimos datos del TNC -> encender LED
    blinkLED(2, 100);

    // Eco: reenviar el mismo paquete como si fuera recibido del aire
    kissSendFrame(CMD_DATA, data, len);

    // También enviamos un beacon APRS de respuesta
    delay(50);
    kissSendAPRSBeacon();

  } else if (cmd == CMD_HARDWARE) {
    // Solicitud de versión de hardware
    kissSendVersion();
    blinkLED(1, 200);
  }
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LED_OFF);

  // LED rápido al iniciar (antes de USB, para que se vea)
  blinkLED(3, 100);

  Serial.begin(SERIAL_BAUD);

  // Esperar hasta 3 segundos a que el host USB conecte
  // (sin esto el ESP32-C3 puede reiniciarse por WDT)
  for (int i = 0; i < 30; i++) {
    if (Serial) break;
    delay(100);
    // Parpadeo rápido mientras espera conexión USB
    if (i % 5 == 0) {
      digitalWrite(LED_PIN, LED_ON);
    } else if (i % 5 == 2) {
      digitalWrite(LED_PIN, LED_OFF);
    }
  }

  delay(200);

  // Enviar mensaje de inicio
  uint8_t hello[] = "KISS TNC SIMULATOR READY 38400 8N1";
  kissSendFrame(CMD_HARDWARE, hello, sizeof(hello) - 1);

  // LED fijo indicando listo
  digitalWrite(LED_PIN, LED_ON);
  delay(300);
  digitalWrite(LED_PIN, LED_OFF);
}

void loop() {
  // --- Leer Serial ---
  while (Serial.available() > 0) {
    uint8_t b = Serial.read();

    if (escaped) {
      escaped = false;
      if (b == TFEND) b = FEND;
      else if (b == TFESC) b = FESC;
      else {
        // Error de escape, reiniciar
        inFrame = false;
        rxLen = 0;
        continue;
      }
      if (inFrame && rxLen < sizeof(rxBuf)) {
        rxBuf[rxLen++] = b;
      }
    } else if (b == FESC) {
      escaped = true;
    } else if (b == FEND) {
      if (inFrame && rxLen > 0) {
        // Frame completo recibido
        uint8_t cmd = rxBuf[0];
        uint16_t dataLen = rxLen - 1;
        processKISSFrame(cmd, &rxBuf[1], dataLen);
      }
      // Iniciar nuevo frame
      inFrame = true;
      rxLen = 0;
      escaped = false;
    } else {
      if (inFrame && rxLen < sizeof(rxBuf)) {
        rxBuf[rxLen++] = b;
      }
    }
  }

  // --- Beacon periódico ---
  if (millis() - lastBeacon > BEACON_INTERVAL) {
    lastBeacon = millis();
    kissSendAPRSBeacon();
    blinkLED(1, 50);
  }
}
