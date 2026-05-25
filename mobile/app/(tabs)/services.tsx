import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import client from '@/api/client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import { AFTERCARE_DATA, AftercareCategory } from '@/constants/aftercareData';

export default function AftercareScreen() {
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
  const [hasBooking, setHasBooking] = useState<boolean | null>(null); // null = loading/checking
  const [activeTopicIndex, setActiveTopicIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  const selectCategory = async (key: string) => {
    setSelectedCategoryKey(key);
    setActiveTopicIndex(0);
    setLoading(true);
    setHasBooking(null);

    const category = AFTERCARE_DATA[key];
    try {
      const res = await client.get('/bookings/list');
      const allBookings = [
        ...(res.data?.data?.bookings || []),
        ...(res.data?.data?.requests || []),
      ];

      // Check if any booking matches the serviceKeywords
      const found = allBookings.some((b: any) => {
        const svc = (b.latest_service || b.service_names || '').toLowerCase();
        return category.serviceKeywords.some((kw) => svc.includes(kw.toLowerCase()));
      });
      setHasBooking(found);
    } catch (err) {
      console.error('Failed to check bookings for aftercare:', err);
      setHasBooking(false);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLanding = () => {
    setSelectedCategoryKey(null);
    setHasBooking(null);
  };

  const handleGetQuote = () => {
    Linking.openURL('https://gaq.maskpro.ph').catch((err) =>
      console.error('Failed to open URL:', err)
    );
  };

  // Category Landing view
  if (!selectedCategoryKey) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.landingContent}>
        <View style={styles.landingHeader}>
          <Text style={styles.landingTitle}>Aftercare Center</Text>
          <Text style={styles.landingSubtitle}>
            Follow these professional care guidelines to maintain your vehicle's premium finish.
          </Text>
        </View>

        <View style={styles.categoryList}>
          {Object.entries(AFTERCARE_DATA).map(([key, cat]) => (
            <TouchableOpacity
              key={key}
              style={styles.categoryCard}
              onPress={() => selectCategory(key)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={cat.colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cardGradient}
              >
                <View style={styles.cardIconWrapper}>
                  <Text style={styles.cardIconText}>{cat.icon}</Text>
                </View>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardTitle}>{cat.title}</Text>
                  <Text style={styles.cardSubtitle}>{cat.subtitle}</Text>
                </View>
                <FontAwesome name="chevron-right" size={14} color="#ffffff" style={styles.chevronIcon} />
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    );
  }

  const category = AFTERCARE_DATA[selectedCategoryKey];

  return (
    <View style={styles.container}>
      {/* Article Header with Back Button */}
      <View style={styles.articleHeader}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackToLanding}>
          <FontAwesome name="chevron-left" size={14} color="#4b5563" />
          <Text style={styles.backButtonText}>Guides</Text>
        </TouchableOpacity>
        <Text style={styles.articleHeaderTitle} numberOfLines={1}>
          {category.title}
        </Text>
      </View>

      {loading ? (
        <LoadingSpinner message="Checking guide access..." />
      ) : !hasBooking ? (
        /* LOCKED GUIDE - SHOW CTA */
        <ScrollView contentContainerStyle={styles.lockedContainer}>
          <LinearGradient
            colors={category.colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.lockedHero}
          >
            <Text style={styles.lockedHeroIcon}>{category.icon}</Text>
            <Text style={styles.lockedHeroTitle}>{category.title}</Text>
            <Text style={styles.lockedHeroSubtitle}>{category.subtitle}</Text>
          </LinearGradient>

          <View style={styles.lockedContent}>
            <Text style={styles.lockedTitle}>Unlock this Aftercare Guide</Text>
            <Text style={styles.lockedDesc}>
              This professional guide is exclusive to customers who have booked a {category.title} service.
              Book a service now to unlock access.
            </Text>

            <View style={styles.promoBadge}>
              <LinearGradient
                colors={['#f59e0b', '#d97706']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.promoBadgeGradient}
              >
                <Text style={styles.promoOffText}>5% OFF</Text>
                <Text style={styles.promoHelperText}>Exclusive App Booking Discount</Text>
              </LinearGradient>
            </View>

            <TouchableOpacity style={styles.quoteButton} onPress={handleGetQuote} activeOpacity={0.8}>
              <LinearGradient
                colors={['#4f46e5', '#6366f1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.quoteButtonGradient}
              >
                <FontAwesome name="comments" size={16} color="#ffffff" style={styles.quoteBtnIcon} />
                <Text style={styles.quoteButtonText}>Get a Quote Now</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        /* UNLOCKED GUIDE - SHOW ARTICLES */
        <View style={styles.articleLayout}>
          {/* Hero Banner */}
          <LinearGradient
            colors={category.colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.articleHero}
          >
            <Text style={styles.articleHeroIcon}>{category.icon}</Text>
            <View>
              <Text style={styles.articleHeroTitle}>{category.title}</Text>
              <Text style={styles.articleHeroSubtitle}>{category.subtitle}</Text>
            </View>
          </LinearGradient>

          {/* Horizontal Tabs bar */}
          <View style={styles.tabsWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
              {category.topics.map((t, idx) => {
                const isActive = activeTopicIndex === idx;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.tabItem, isActive && styles.tabItemActive]}
                    onPress={() => setActiveTopicIndex(idx)}
                  >
                    <Text style={styles.tabIcon}>{t.icon}</Text>
                    <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Active Topic Content */}
          <ScrollView contentContainerStyle={styles.articleContent}>
            <Text style={styles.topicTitle}>{category.topics[activeTopicIndex].title}</Text>

            <View style={styles.sectionsList}>
              {category.topics[activeTopicIndex].sections.map((section, sIdx) => (
                <View key={sIdx} style={styles.sectionCard}>
                  <Text style={styles.sectionHeading}>{section.heading}</Text>
                  <Text style={styles.sectionText}>{section.content}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  landingContent: {
    padding: 16,
    paddingBottom: 32,
  },
  landingHeader: {
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  landingTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  landingSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  categoryList: {
    gap: 16,
  },
  categoryCard: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  cardIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  cardIconText: {
    fontSize: 24,
  },
  cardMeta: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  cardSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  chevronIcon: {
    marginLeft: 8,
  },
  articleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    backgroundColor: '#ffffff',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingRight: 12,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
    marginLeft: 8,
  },
  articleHeaderTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  lockedContainer: {
    paddingBottom: 40,
  },
  lockedHero: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  lockedHeroIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  lockedHeroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
  },
  lockedHeroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 6,
    textAlign: 'center',
  },
  lockedContent: {
    padding: 24,
    alignItems: 'center',
  },
  lockedTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  lockedDesc: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  promoBadge: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 28,
    width: '100%',
    maxWidth: 280,
  },
  promoBadgeGradient: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  promoOffText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
  },
  promoHelperText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
    fontWeight: '600',
  },
  quoteButton: {
    width: '100%',
    maxWidth: 240,
    borderRadius: 12,
    overflow: 'hidden',
  },
  quoteButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
  },
  quoteBtnIcon: {
    marginRight: 8,
  },
  quoteButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  articleLayout: {
    flex: 1,
  },
  articleHero: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  articleHeroIcon: {
    fontSize: 36,
  },
  articleHeroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  articleHeroSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  tabsWrapper: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  tabsScroll: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
    gap: 6,
  },
  tabItemActive: {
    backgroundColor: '#e0e7ff',
    borderWidth: 1,
    borderColor: '#818cf8',
  },
  tabIcon: {
    fontSize: 14,
  },
  tabLabel: {
    fontSize: 12,
    color: '#4b5563',
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#4f46e5',
  },
  articleContent: {
    padding: 16,
    paddingBottom: 40,
  },
  topicTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
    lineHeight: 22,
  },
  sectionsList: {
    gap: 16,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 8,
  },
  sectionText: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 20,
  },
});
