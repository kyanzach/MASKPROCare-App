import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { Text, View } from '@/components/Themed';
import client from '@/api/client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import AlertBanner from '@/components/ui/AlertBanner';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';

interface Post {
  id: number;
  type: 'sos' | 'discussion';
  title: string;
  body: string;
  created_at: string;
  author_name: string;
  author_photo?: string | null;
  comment_count?: number;
  status?: string;
}

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://care.maskpro.ph/api';

export default function CommunityScreen() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Form states
  const [isPosting, setIsPosting] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [postType, setPostType] = useState<'discussion' | 'sos'>('discussion');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Alerts
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const fetchPosts = async () => {
    try {
      const res = await client.get('/community/posts');
      if (res.data?.success) {
        setPosts(res.data?.data?.posts || []);
      }
    } catch (err) {
      console.error('Failed to fetch posts:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPosts();
  }, []);

  const triggerAlert = (type: 'success' | 'error', msg: string) => {
    if (type === 'success') {
      setSuccess(msg);
      setError('');
    } else {
      setError(msg);
      setSuccess('');
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !body.trim()) {
      setError('Please provide both title and details.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const res = await client.post('/community/posts', {
        type: postType,
        title,
        body,
      });

      if (res.data?.success) {
        const successMsg =
          postType === 'sos'
            ? 'Your MASKPRO S.O.S. request was submitted instantly!'
            : 'Your post has been submitted.';
        triggerAlert('success', successMsg);
        
        setTitle('');
        setBody('');
        setIsPosting(false);
        fetchPosts();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit post.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const timeAgo = (dateStr: string) => {
    try {
      const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
      if (diff < 60) return 'Just now';
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const getAuthorPhotoUrl = (photoPath?: string | null) => {
    if (!photoPath) return null;
    if (photoPath.startsWith('http')) return photoPath;
    
    // Stripe '/api' to get root care.maskpro.ph base
    const rootBase = API_BASE.endsWith('/api') ? API_BASE.slice(0, -4) : API_BASE;
    return `${rootBase}/api/uploads/photos/${photoPath}`;
  };

  if (isPosting) {
    return (
      <View style={styles.container}>
        <ScrollView style={styles.formContainer} keyboardShouldPersistTaps="handled">
          <Text style={styles.formTitle}>Create a Post</Text>
          
          <View style={styles.typeSelector}>
            <TouchableOpacity 
              style={[styles.typeButton, postType === 'discussion' && styles.typeActive]}
              onPress={() => setPostType('discussion')}
            >
              <FontAwesome name="comments-o" size={16} color={postType === 'discussion' ? '#1d4ed8' : '#6b7280'} style={styles.selectorIcon} />
              <Text style={postType === 'discussion' ? styles.typeActiveText : styles.typeText}>Discussion</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.typeButtonSos, postType === 'sos' && styles.typeActiveSos]}
              onPress={() => setPostType('sos')}
            >
              <FontAwesome name="exclamation-triangle" size={16} color={postType === 'sos' ? '#b91c1c' : '#6b7280'} style={styles.selectorIcon} />
              <Text style={postType === 'sos' ? styles.typeActiveTextSos : styles.typeTextSos}>MASKPRO S.O.S.</Text>
            </TouchableOpacity>
          </View>

          {error ? <AlertBanner message={error} type="error" onDismiss={() => setError('')} /> : null}

          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            placeholder={postType === 'sos' ? "E.g. Flat tire at EDSA Ayala" : "E.g. What's the best tire wax?"}
            value={title}
            onChangeText={setTitle}
            placeholderTextColor="#9ca3af"
          />

          <Text style={styles.label}>Details</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder={
              postType === 'sos' 
              ? "Guide: Where are you? What is your car model? What is the issue? \n\nExample: My car battery died at SM Megamall parking. I drive a Toyota Fortuner. Can any techs or members nearby help?"
              : "Share your thoughts or ask a question..."
            }
            value={body}
            onChangeText={setBody}
            multiline
            numberOfLines={6}
            placeholderTextColor="#9ca3af"
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setIsPosting(false)} disabled={isSubmitting}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={postType === 'sos' ? styles.submitButtonSos : styles.submitButton} 
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.submitButtonText}>Publish</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.feed}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4f46e5']} />
        }
      >
        <View style={styles.communityHeader}>
          <Text style={styles.communityTitle}>Community Care</Text>
        </View>

        {success ? <AlertBanner message={success} type="success" onDismiss={() => setSuccess('')} autoDismissMs={3000} /> : null}
        {error ? <AlertBanner message={error} type="error" onDismiss={() => setError('')} autoDismissMs={4000} /> : null}

        {loading ? (
          <ActivityIndicator size="large" color="#4f46e5" style={styles.loader} />
        ) : posts.length === 0 ? (
          <EmptyState
            icon="users"
            title="No posts yet"
            description="Be the first to start a discussion or ask for help in the Care Community!"
            actionText="Create Post"
            onAction={() => setIsPosting(true)}
          />
        ) : (
          <View style={styles.postsList}>
            {posts.map((post) => {
              const isSos = post.type === 'sos';
              const photoUrl = getAuthorPhotoUrl(post.author_photo);
              const authorInitial = post.author_name ? post.author_name.charAt(0).toUpperCase() : 'U';

              return (
                <View key={post.id} style={[styles.postCard, isSos && styles.postCardSos]}>
                  {isSos ? (
                    <View style={styles.sosTag}>
                      <Text style={styles.sosTagText}>MASKPRO S.O.S.</Text>
                    </View>
                  ) : null}

                  <View style={styles.postHeader}>
                    {photoUrl ? (
                      <Image source={{ uri: photoUrl }} style={styles.authorAvatar} />
                    ) : (
                      <View style={styles.authorAvatarInitials}>
                        <Text style={styles.authorAvatarInitialsText}>{authorInitial}</Text>
                      </View>
                    )}

                    <View style={styles.authorMeta}>
                      <Text style={styles.authorName}>{post.author_name}</Text>
                      <Text style={styles.postTime}>{timeAgo(post.created_at)}</Text>
                    </View>
                  </View>

                  <Text style={styles.postCardTitle}>{post.title}</Text>
                  <Text style={styles.postBody}>{post.body}</Text>

                  <View style={styles.postFooter}>
                    <View style={styles.commentCount}>
                      <FontAwesome name="comment-o" size={14} color="#64748b" style={styles.commentIcon} />
                      <Text style={styles.commentText}>{post.comment_count || 0} Comments</Text>
                    </View>

                    {isSos && post.status === 'open' ? (
                      <TouchableOpacity style={styles.helpButton} activeOpacity={0.7}>
                        <FontAwesome name="life-ring" size={12} color="#ef4444" style={styles.helpIcon} />
                        <Text style={styles.helpButtonText}>Offer Help</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setIsPosting(true)} activeOpacity={0.85}>
        <FontAwesome name="pencil-square-o" size={24} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  feed: {
    padding: 16,
    paddingBottom: 80,
  },
  communityHeader: {
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  communityTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  loader: {
    marginTop: 40,
  },
  postsList: {
    gap: 16,
    backgroundColor: 'transparent',
  },
  postCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  postCardSos: {
    borderColor: '#fca5a5',
    shadowColor: '#ef4444',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  sosTag: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#ef4444',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderBottomLeftRadius: 12,
  },
  sosTagText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: 'transparent',
  },
  authorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  authorAvatarInitials: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  authorAvatarInitialsText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
  },
  authorMeta: {
    backgroundColor: 'transparent',
  },
  authorName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1f2937',
  },
  postTime: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 1,
  },
  postCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  postBody: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 20,
    marginBottom: 16,
  },
  postFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 12,
    backgroundColor: 'transparent',
  },
  commentCount: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  commentIcon: {
    marginRight: 6,
  },
  commentText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  helpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
  },
  helpIcon: {
    marginRight: 4,
  },
  helpButtonText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4f46e5',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  formContainer: {
    padding: 20,
    backgroundColor: '#ffffff',
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 20,
  },
  typeSelector: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: 'transparent',
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    padding: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  typeActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  selectorIcon: {
    marginRight: 6,
  },
  typeText: {
    color: '#6b7280',
    fontWeight: '600',
    fontSize: 13,
  },
  typeActiveText: {
    color: '#1d4ed8',
    fontWeight: '700',
    fontSize: 13,
  },
  typeButtonSos: {
    flex: 1,
    flexDirection: 'row',
    padding: 12,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: '#d1d5db',
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  typeActiveSos: {
    backgroundColor: '#fef2f2',
    borderColor: '#ef4444',
  },
  typeTextSos: {
    color: '#6b7280',
    fontWeight: '600',
    fontSize: 13,
  },
  typeActiveTextSos: {
    color: '#b91c1c',
    fontWeight: '700',
    fontSize: 13,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    marginBottom: 16,
  },
  textArea: {
    height: 140,
    textAlignVertical: 'top',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingBottom: 40,
    backgroundColor: 'transparent',
  },
  cancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#4b5563',
    fontWeight: '700',
    fontSize: 14,
  },
  submitButton: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#4f46e5',
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonSos: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#dc2626',
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#dc2626',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  submitButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
});
