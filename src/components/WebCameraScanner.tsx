import React from 'react';

interface WebCameraScannerProps {
  onBarcodeScanned: (data: string) => void;
  onClose: () => void;
}

/**
 * Native version of WebCameraScanner.
 * Does nothing and returns null, as native uses expo-camera instead.
 */
export default function WebCameraScanner(_props: WebCameraScannerProps) {
  return null;
}
