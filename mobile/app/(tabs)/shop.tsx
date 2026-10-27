import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import AlertPromptModal, { AlertType } from '@/components/ui/AlertPromptModal';

export default function ShopScreen() {
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [alertModal, setAlertModal] = useState<{
    visible: boolean;
    type: AlertType;
    title: string;
    message: string;
  }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });

  const showAlert = (type: AlertType, title: string, message: string) => {
    setAlertModal({ visible: true, type, title, message });
  };

  const handleNotifyMe = () => {
    if (!emailOrPhone.trim()) {
      showAlert('warning', 'Input Required', 'Please enter your mobile number or email address.');
      return;
    }
    setSubscribed(true);
    showAlert(
      'success',
      "You're on the VIP List!",
      'We will notify you with your exclusive 20% discount as soon as the MaskPro Shop launches.'
    );
  };

  const CATEGORIES = [
    { title: 'Detailing Kits', icon: 'paint-brush', desc: 'pH-neutral shampoos & ceramic boosters' },
    { title: 'Microfiber Towels', icon: 'shield', desc: '1200 GSM ultra-plush drying towels' },
    { title: 'Dashcams & Tech', icon: 'video-camera', desc: '4K dual-channel HDR cameras' },
    { title: 'Aromatherapy', icon: 'leaf', desc: 'Premium scents & air purifiers' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* Page Title */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>MaskPro Shop</Text>
      </View>

      {/* Hero Card */}
      <LinearGradient
        colors={['#6366f1', '#8b5cf6', '#a78bfa']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.bagIconContainer}>
          <Text style={styles.bagEmoji}>🛍️</Text>
        </View>

        <View style={styles.comingSoonBadge}>
          <Text style={styles.comingSoonText}>COMING SOON</Text>
        </View>

        <Text style={styles.heroTitle}>The MaskPro Shop is Almost Here!</Text>
        <Text style={styles.heroSubtitle}>
          We're building something special for our VIP customers. Premium car accessories, high-grade gadgets, and members-only deals — all at your fingertips.
        </Text>

        {/* Feature Highlights */}
        <View style={styles.featuresRow}>
          {[
            { icon: '💎', text: 'VIP Exclusive Discounts' },
            { icon: '🔧', text: 'Premium Gadgets' },
            { icon: '🎁', text: 'Loyalty Rewards' },
          ].map((f, i) => (
            <View key={i} style={styles.featurePill}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* Preview Categories */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What's in Store for You</Text>
        <View style={styles.categoriesGrid}>
          {CATEGORIES.map((cat, i) => (
            <View key={i} style={styles.categoryCard}>
              <View style={styles.categoryIconBg}>
                <FontAwesome name={cat.icon as any} size={20} color="#4f46e5" />
              </View>
              <Text style={styles.categoryTitle}>{cat.title}</Text>
              <Text style={styles.categoryDesc}>{cat.desc}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Early Access Notification Card */}
      <View style={styles.notifyCard}>
        <FontAwesome name="bell" size={24} color="#6366f1" style={{ marginBottom: 12 }} />
        <Text style={styles.notifyTitle}>Get Notified at Launch</Text>
        <Text style={styles.notifySubtitle}>
          Be among the first 100 shoppers to receive an exclusive 20% discount on your first order.
        </Text>

        {subscribed ? (
          <View style={styles.subscribedBanner}>
            <FontAwesome name="check-circle" size={16} color="#16a34a" style={{ marginRight: 8 }} />
            <Text style={styles.subscribedText}>You're on the VIP launch list! We'll notify you soon.</Text>
          </View>
        ) : (
          <View style={styles.notifyForm}>
            <TextInput
              style={styles.notifyInput}
              placeholder="Enter mobile or email"
              placeholderTextColor="#94a3b8"
              value={emailOrPhone}
              onChangeText={setEmailOrPhone}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.notifyButton} onPress={handleNotifyMe} activeOpacity={0.85}>
              <Text style={styles.notifyButtonText}>Notify Me</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Modern Modal Alert Prompt */}
      <AlertPromptModal
        visible={alertModal.visible}
        type={alertModal.type}
        title={alertModal.title}
        message={alertModal.message}
        onConfirm={() => setAlertModal(prev => ({ ...prev, visible: false }))}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
  },
  heroCard: {
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  bagIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  bagEmoji: {
    fontSize: 34,
  },
  comingSoonBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingVertical: 4,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginBottom: 12,
  },
  comingSoonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 28,
  },
  heroSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  featuresRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  featureIcon: {
    fontSize: 12,
  },
  featureText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 14,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryCard: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  categoryIconBg: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  categoryDesc: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 16,
  },
  notifyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  notifyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
  },
  notifySubtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  notifyForm: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
  },
  notifyInput: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#1e293b',
  },
  notifyButton: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifyButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  subscribedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    padding: 12,
  },
  subscribedText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '600',
  },
});
