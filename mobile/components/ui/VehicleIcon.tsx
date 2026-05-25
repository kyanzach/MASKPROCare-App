import React from 'react';
import { StyleSheet, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';

const VEHICLE_ICONS: Record<string, { icon: React.ComponentProps<typeof FontAwesome>['name']; colors: [string, string] }> = {
  toyota: { icon: 'car', colors: ['#e53e3e', '#c53030'] },
  honda: { icon: 'car', colors: ['#3182ce', '#2c5aa0'] },
  nissan: { icon: 'car', colors: ['#d69e2e', '#b7791f'] },
  mitsubishi: { icon: 'car', colors: ['#38a169', '#2f855a'] },
  hyundai: { icon: 'car', colors: ['#805ad5', '#6b46c1'] },
  kia: { icon: 'car', colors: ['#e53e3e', '#c53030'] },
  mazda: { icon: 'car', colors: ['#dd6b20', '#c05621'] },
  subaru: { icon: 'car', colors: ['#3182ce', '#2c5aa0'] },
  suzuki: { icon: 'car', colors: ['#38a169', '#2f855a'] },
  isuzu: { icon: 'truck', colors: ['#d69e2e', '#b7791f'] },
  ford: { icon: 'car', colors: ['#3182ce', '#2c5aa0'] },
  bmw: { icon: 'car', colors: ['#4a5568', '#2d3748'] },
  mercedes: { icon: 'car', colors: ['#4a5568', '#2d3748'] },
  tesla: { icon: 'bolt', colors: ['#e53e3e', '#c53030'] },
};

export function getVehicleConfig(make: string, model: string = '') {
  const m = (make || '').toLowerCase();
  const mod = (model || '').toLowerCase();
  
  if (mod.includes('innova') || mod.includes('fortuner') || mod.includes('suv')) {
    return { icon: 'car' as const, colors: ['#38a169', '#2f855a'] as [string, string] };
  }
  if (mod.includes('truck') || mod.includes('pickup')) {
    return { icon: 'truck' as const, colors: ['#d69e2e', '#b7791f'] as [string, string] };
  }
  if (mod.includes('van') || mod.includes('hiace')) {
    return { icon: 'truck' as const, colors: ['#805ad5', '#6b46c1'] as [string, string] };
  }
  
  return VEHICLE_ICONS[m] || { icon: 'car' as const, colors: ['#0ea5e9', '#1e40af'] as [string, string] };
}

interface VehicleIconProps {
  make: string;
  model?: string;
  size?: number;
}

export default function VehicleIcon({ make, model = '', size = 48 }: VehicleIconProps) {
  const { icon, colors } = getVehicleConfig(make, model);
  const iconSize = size * 0.5;

  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <FontAwesome name={icon} size={iconSize} color="#ffffff" />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
