import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

interface WebCameraScannerProps {
  onBarcodeScanned: (data: string) => void;
  onClose: () => void;
}

/**
 * Web-only camera barcode scanner using html5-qrcode.
 * Renders a camera feed inside a div and decodes barcodes in real-time.
 */
export default function WebCameraScanner({ onBarcodeScanned, onClose }: WebCameraScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<any>(null);
  const containerIdRef = useRef(`web-scanner-${Date.now()}`);
  const hasCalledBack = useRef(false);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        // State 2 = SCANNING
        if (state === 2) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (e) {
        console.warn('Error stopping scanner:', e);
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    let mounted = true;

    const initScanner = async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');

        if (!mounted) return;

        const html5QrCode = new Html5Qrcode(containerIdRef.current, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          verbose: false,
        });

        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 300, height: 150 },
            aspectRatio: 1.5,
          },
          (decodedText: string) => {
            // Debounce: only fire once per scan until component resets
            if (!hasCalledBack.current) {
              hasCalledBack.current = true;
              onBarcodeScanned(decodedText);
              // Reset after 2 seconds to allow next scan
              setTimeout(() => {
                hasCalledBack.current = false;
              }, 2000);
            }
          },
          () => {
            // QR code scan failure - ignore (happens every frame when no code detected)
          }
        );

        if (mounted) {
          setIsScanning(true);
        }
      } catch (err: any) {
        console.error('Camera scanner error:', err);
        if (mounted) {
          if (err?.message?.includes('NotAllowedError') || err?.name === 'NotAllowedError') {
            setError('Permiso de cámara denegado. Habilitalo en la configuración del navegador.');
          } else if (err?.message?.includes('NotFoundError') || err?.name === 'NotFoundError') {
            setError('No se encontró ninguna cámara en este dispositivo.');
          } else {
            setError(`Error al iniciar la cámara: ${err?.message || err}`);
          }
        }
      }
    };

    // Small delay to ensure the DOM element is rendered
    const timer = setTimeout(initScanner, 300);

    return () => {
      mounted = false;
      clearTimeout(timer);
      stopScanner();
    };
  }, []);

  const handleClose = async () => {
    await stopScanner();
    onClose();
  };

  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📷 Cámara Web — Escáner</Text>
        <Text style={styles.subtitle}>
          {isScanning
            ? 'Apunta la cámara a un código de barras'
            : error
            ? ''
            : 'Iniciando cámara...'}
        </Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* This div is where html5-qrcode renders the camera feed */}
      <View style={styles.cameraWrapper}>
        <div
          id={containerIdRef.current}
          style={{
            width: '100%',
            maxWidth: 500,
            margin: '0 auto',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        />
      </View>

      {isScanning && (
        <View style={styles.scanIndicator}>
          <Text style={styles.scanIndicatorText}>🔴 Escaneando en vivo...</Text>
        </View>
      )}

      <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
        <Text style={styles.closeBtnText}>✕ Cerrar Cámara</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  header: {
    marginBottom: 12,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 13,
  },
  cameraWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    minHeight: 200,
  },
  errorBox: {
    backgroundColor: '#1C1917',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  errorIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  scanIndicator: {
    backgroundColor: '#16A34A20',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'center',
    marginBottom: 12,
  },
  scanIndicatorText: {
    color: '#22C55E',
    fontSize: 13,
    fontWeight: '600',
  },
  closeBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
