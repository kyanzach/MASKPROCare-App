import React, { useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { SvgXml } from 'react-native-svg';
import bwipjs from 'bwip-js/generic';

interface PDF417BarcodeProps {
  text: string;
  scale?: number;
  height?: number;
  thinFullWidth?: boolean;
}

export default function PDF417Barcode({ text, scale = 2, height = 12, thinFullWidth = false }: PDF417BarcodeProps) {
  const svgXml = useMemo(() => {
    if (!text) return null;
    try {
      // Generate SVG string using bwip-js
      const svg = bwipjs.toSVG({
        bcid: 'pdf417',
        text: String(text),
        scale: scale,
        height: height,
        includetext: false,
      });
      if (thinFullWidth && svg) {
        return svg.replace('<svg ', '<svg preserveAspectRatio="none" ');
      }
      return svg;
    } catch (err) {
      console.error('PDF417 SVG generation error:', err);
      return null;
    }
  }, [text, scale, height, thinFullWidth]);

  if (!svgXml) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load barcode</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, thinFullWidth && { paddingVertical: 4 }]}>
      <SvgXml xml={svgXml} width="100%" height={thinFullWidth ? 26 : height * 8} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },
  errorContainer: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#9ca3af',
  },
});
