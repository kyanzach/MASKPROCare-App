import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import client from '@/api/client';
import { useAuth } from '@/context/AuthContext';

interface AiLoginModalProps {
  visible: boolean;
  onClose: () => void;
  initialMobile?: string;
}

interface ChatMessage {
  sender: 'ai' | 'user';
  text: string;
  time: string;
  verified?: boolean;
  failed?: boolean;
  score?: number;
}

export default function AiLoginModal({
  visible,
  onClose,
}: AiLoginModalProps) {
  const { login } = useAuth();
  const insets = useSafeAreaInsets();

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    verified: boolean;
    score: number;
  } | null>(null);
  const [errorNotice, setErrorNotice] = useState('');

  const scrollViewRef = useRef<ScrollView | null>(null);
  const inputRef = useRef<TextInput | null>(null);

  const formatNowTime = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  useEffect(() => {
    if (visible) {
      startSession();
    } else {
      resetState();
    }
  }, [visible]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const resetState = () => {
    setSessionToken(null);
    setMessages([]);
    setInputText('');
    setLoading(false);
    setIsTyping(false);
    setVerificationResult(null);
    setErrorNotice('');
  };

  const startSession = async () => {
    setLoading(true);
    setErrorNotice('');
    setVerificationResult(null);
    setInputText('');
    setIsTyping(false);
    setMessages([]);

    try {
      const res = await client.post('/auth/ai-login/session');
      if (res.data?.success) {
        setSessionToken(res.data.data.session_token);
        setMessages([
          {
            sender: 'ai',
            text:
              res.data.data.message ||
              "Hello! I'm Izumi, your MaskPro Care Assistant. Don't worry if your SMS code hasn't arrived. I can verify your identity through a few quick questions so you can log in safely.\n\nTo begin, what is your full name?",
            time: formatNowTime(),
          },
        ]);
        setTimeout(() => inputRef.current?.focus(), 350);
      } else {
        setErrorNotice(res.data?.message || 'Unable to start AI verification session.');
      }
    } catch (err: any) {
      setErrorNotice(
        err.response?.data?.message || 'Unable to connect to AI assistant. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text || !sessionToken || loading || isTyping) return;

    const userMsg: ChatMessage = {
      sender: 'user',
      text,
      time: formatNowTime(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);
    setErrorNotice('');

    try {
      const res = await client.post('/auth/ai-login/message', {
        session_token: sessionToken,
        message: text,
      });

      setIsTyping(false);

      if (res.data?.success) {
        if (res.data.verified && res.data.token) {
          const aiMsg: ChatMessage = {
            sender: 'ai',
            text: res.data.message,
            time: formatNowTime(),
            verified: true,
            score: res.data.score,
          };
          setMessages((prev) => [...prev, aiMsg]);
          setVerificationResult({ verified: true, score: res.data.score });

          setTimeout(async () => {
            await login(res.data.token, res.data.customer);
            onClose();
          }, 1600);
        } else {
          const aiMsg: ChatMessage = {
            sender: 'ai',
            text: res.data.data?.message || 'Thank you! Next question...',
            time: formatNowTime(),
          };
          setMessages((prev) => [...prev, aiMsg]);
          setTimeout(() => inputRef.current?.focus(), 200);
        }
      } else {
        const aiMsg: ChatMessage = {
          sender: 'ai',
          text: res.data?.message || 'Verification could not be completed with 90% confidence.',
          time: formatNowTime(),
          failed: true,
          score: res.data?.score || 0,
        };
        setMessages((prev) => [...prev, aiMsg]);
        setVerificationResult({ verified: false, score: res.data?.score || 0 });
      }
    } catch (err: any) {
      setIsTyping(false);
      setErrorNotice(err.response?.data?.message || 'Connection error. Please try again.');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.modalCard, { marginBottom: Math.max(insets.bottom, 12) }]}>
          {/* Header */}
          <LinearGradient
            colors={['#1e3a8a', '#0284c7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <View style={styles.headerLeft}>
              <View style={styles.avatarCircle}>
                <Ionicons name="hardware-chip-outline" size={20} color="#ffffff" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.headerTitleRow}>
                  <Text numberOfLines={1} style={styles.headerTitle}>
                    Izumi AI Login Helper
                  </Text>
                  <View style={styles.onlineBadge}>
                    <Text style={styles.onlineBadgeText}>ONLINE</Text>
                  </View>
                </View>
                <Text numberOfLines={1} style={styles.headerSub}>
                  Identity Verification Assistant
                </Text>
              </View>
            </View>

            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.75}>
              <Ionicons name="close" size={18} color="#ffffff" />
            </TouchableOpacity>
          </LinearGradient>

          {/* Security Info Banner */}
          <View style={styles.infoBanner}>
            <Ionicons name="shield-checkmark" size={14} color="#0284c7" />
            <Text numberOfLines={1} adjustsFontSizeToFit style={styles.infoBannerText}>
              SMS delayed? Answer 5 security questions (90% match required).
            </Text>
          </View>

          {/* Error Banner */}
          {errorNotice ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color="#b91c1c" />
              <Text style={styles.errorBannerText}>{errorNotice}</Text>
            </View>
          ) : null}

          {/* Chat Stream */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.chatArea}
            contentContainerStyle={styles.chatContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color="#0284c7" />
                <Text style={styles.loadingText}>Connecting to Izumi Assistant...</Text>
              </View>
            ) : null}

            {messages.map((msg, idx) => {
              const isAi = msg.sender === 'ai';
              return (
                <View
                  key={idx}
                  style={[
                    styles.msgRow,
                    isAi ? styles.msgRowAi : styles.msgRowUser,
                  ]}
                >
                  {isAi ? (
                    <View style={styles.aiMiniAvatar}>
                      <Ionicons name="hardware-chip-outline" size={13} color="#ffffff" />
                    </View>
                  ) : null}

                  <View
                    style={[
                      styles.bubble,
                      isAi ? styles.bubbleAi : styles.bubbleUser,
                    ]}
                  >
                    <Text style={isAi ? styles.bubbleTextAi : styles.bubbleTextUser}>
                      {msg.text}
                    </Text>

                    {msg.verified ? (
                      <View style={styles.verifiedTag}>
                        <Ionicons name="checkmark-circle" size={15} color="#15803d" />
                        <Text style={styles.verifiedTagText}>
                          Score: {msg.score}% — Verified! Logging in...
                        </Text>
                      </View>
                    ) : null}

                    {msg.failed ? (
                      <View style={styles.failedTag}>
                        <Text style={styles.failedTagText}>
                          Score: {msg.score}% (Requires 90%)
                        </Text>
                      </View>
                    ) : null}

                    <Text
                      style={[
                        styles.timeText,
                        isAi ? styles.timeTextAi : styles.timeTextUser,
                      ]}
                    >
                      {msg.time}
                    </Text>
                  </View>
                </View>
              );
            })}

            {isTyping ? (
              <View style={[styles.msgRow, styles.msgRowAi]}>
                <View style={styles.aiMiniAvatar}>
                  <Ionicons name="hardware-chip-outline" size={13} color="#ffffff" />
                </View>
                <View style={styles.typingBubble}>
                  <ActivityIndicator size="small" color="#0284c7" />
                  <Text style={styles.typingText}>Izumi is checking records...</Text>
                </View>
              </View>
            ) : null}
          </ScrollView>

          {/* Footer Input or Retry Actions */}
          {verificationResult && !verificationResult.verified ? (
            <View style={styles.retryBar}>
              <TouchableOpacity
                style={styles.tryAgainBtn}
                onPress={startSession}
                activeOpacity={0.85}
              >
                <Ionicons name="refresh" size={15} color="#ffffff" />
                <Text numberOfLines={1} adjustsFontSizeToFit style={styles.tryAgainBtnText}>
                  Try Again
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.useOtpBtn}
                onPress={onClose}
                activeOpacity={0.85}
              >
                <Text numberOfLines={1} adjustsFontSizeToFit style={styles.useOtpBtnText}>
                  Use Standard OTP
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.inputBar}>
              <TextInput
                ref={inputRef}
                style={styles.chatInput}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Type your answer here..."
                placeholderTextColor="#94a3b8"
                editable={!loading && !isTyping && !(verificationResult && verificationResult.verified)}
                returnKeyType="send"
                onSubmitEditing={handleSendMessage}
              />
              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  (!inputText.trim() || loading || isTyping) && styles.sendBtnDisabled,
                ]}
                onPress={handleSendMessage}
                disabled={!inputText.trim() || loading || isTyping}
                activeOpacity={0.85}
              >
                <Ionicons name="send" size={16} color="#ffffff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 44,
  },
  modalCard: {
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
    height: '84%',
    backgroundColor: '#ffffff',
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 14,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    flex: 1,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  headerTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#ffffff',
  },
  onlineBadge: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  onlineBadgeText: {
    color: '#ffffff',
    fontSize: 9.5,
    fontWeight: '800',
  },
  headerSub: {
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.86)',
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  infoBannerText: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '500',
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#fee2e2',
    borderRadius: 10,
  },
  errorBannerText: {
    fontSize: 12,
    color: '#b91c1c',
    fontWeight: '600',
    flex: 1,
  },
  chatArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  chatContent: {
    padding: 14,
    gap: 12,
  },
  loadingWrap: {
    paddingVertical: 28,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  msgRowAi: {
    justifyContent: 'flex-start',
  },
  msgRowUser: {
    justifyContent: 'flex-end',
  },
  aiMiniAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 16,
  },
  bubbleAi: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  bubbleUser: {
    backgroundColor: '#0284c7',
    borderBottomRightRadius: 4,
  },
  bubbleTextAi: {
    fontSize: 13.5,
    lineHeight: 20,
    color: '#1e293b',
  },
  bubbleTextUser: {
    fontSize: 13.5,
    lineHeight: 20,
    color: '#ffffff',
  },
  verifiedTag: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#dcfce7',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  verifiedTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803d',
  },
  failedTag: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
  },
  failedTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b91c1c',
  },
  timeText: {
    fontSize: 10,
    marginTop: 4,
  },
  timeTextAi: {
    color: '#94a3b8',
    textAlign: 'left',
  },
  timeTextUser: {
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'right',
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
  },
  typingText: {
    fontSize: 12,
    color: '#64748b',
  },
  retryBar: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  tryAgainBtn: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    backgroundColor: '#0284c7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  tryAgainBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '700',
  },
  useOtpBtn: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  useOtpBtnText: {
    color: '#475569',
    fontSize: 13.5,
    fontWeight: '700',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  chatInput: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#0f172a',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#94a3b8',
  },
});
