import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
  FlatList,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { Text, View } from '@/components/Themed';
import client from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import AlertPromptModal, { AlertType } from '@/components/ui/AlertPromptModal';
import FontAwesome from '@expo/vector-icons/FontAwesome';

interface Post {
  id: number;
  customer_id: number;
  type: 'sos' | 'discussion';
  title: string;
  body: string;
  location?: string | null;
  created_at: string;
  author_name: string;
  author_photo?: string | null;
  comment_count?: number;
  status?: string;
}

interface Comment {
  id: number;
  post_id: number;
  customer_id: number;
  is_tech?: number;
  body: string;
  created_at: string;
  author_name: string;
  author_photo?: string | null;
}

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://care.maskpro.ph/api';

export default function CommunityScreen() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Form states (Create post)
  const [isPosting, setIsPosting] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [postType, setPostType] = useState<'discussion' | 'sos'>('discussion');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Detail / Comments Modal
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  // Modal Alert Prompt (Modern Mobile UX)
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

  const fetchPosts = async () => {
    try {
      const res = await client.get('/community/posts');
      if (res.data?.success) {
        setPosts(res.data?.data?.posts || []);
      }
    } catch (err) {
      // Background load error
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

  const handleCreatePost = async () => {
    if (!title.trim() || !body.trim()) {
      showAlert('warning', 'Missing Details', 'Please provide both a title and details for your post.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await client.post('/community/posts', {
        type: postType,
        title: title.trim(),
        body: body.trim(),
      });

      if (res.data?.success) {
        setTitle('');
        setBody('');
        setIsPosting(false);
        fetchPosts();
        showAlert(
          'success',
          postType === 'sos' ? 'S.O.S. Sent!' : 'Post Published',
          postType === 'sos'
            ? 'Your MASKPRO S.O.S. request was submitted. Nearby drivers and admins have been notified.'
            : 'Your post has been published to the Care Community.'
        );
      } else {
        showAlert('error', 'Post Submission Failed', res.data?.message || 'Failed to submit post. Please try again.');
      }
    } catch (err: any) {
      showAlert('error', 'Submission Failed', err.response?.data?.message || 'Failed to submit post. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openPostDetail = async (post: Post, focusComment = false) => {
    setSelectedPost(post);
    setComments([]);
    setCommentsLoading(true);
    try {
      const res = await client.get(`/community/posts/${post.id}/comments`);
      if (res.data?.success) {
        setComments(res.data?.data?.comments || []);
      }
    } catch (err) {
      // background fetch error
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!selectedPost || !commentText.trim()) return;

    setIsSubmittingComment(true);
    try {
      const res = await client.post('/community/comments', {
        post_id: selectedPost.id,
        body: commentText.trim(),
      });

      if (res.data?.success) {
        setCommentText('');
        // Re-fetch comments to show newly added comment
        const commentsRes = await client.get(`/community/posts/${selectedPost.id}/comments`);
        if (commentsRes.data?.success) {
          const updatedComments = commentsRes.data?.data?.comments || [];
          setComments(updatedComments);
          // Update post comment count in local feed state
          setPosts((prev) =>
            prev.map((p) =>
              p.id === selectedPost.id
                ? { ...p, comment_count: updatedComments.length }
                : p
            )
          );
        }
      }
    } catch (err: any) {
      showAlert('error', 'Comment Failed', err.response?.data?.message || 'Unable to post your comment. Please try again.');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleResolveSos = async () => {
    if (!selectedPost) return;
    setIsResolving(true);
    try {
      const res = await client.put(`/community/posts/${selectedPost.id}/resolve`);
      if (res.data?.success) {
        setSelectedPost((prev) => (prev ? { ...prev, status: 'resolved' } : null));
        setPosts((prev) =>
          prev.map((p) => (p.id === selectedPost.id ? { ...p, status: 'resolved' } : p))
        );
        showAlert('success', 'Resolved', 'Post has been marked as resolved!');
      }
    } catch (err: any) {
      showAlert('error', 'Action Failed', err.response?.data?.message || 'Failed to resolve post.');
    } finally {
      setIsResolving(false);
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
    const rootBase = API_BASE.endsWith('/api') ? API_BASE.slice(0, -4) : API_BASE;
    return `${rootBase}/api/uploads/photos/${photoPath}`;
  };

  const renderPostCard = useCallback(
    ({ item: post }: { item: Post }) => {
      const isSos = post.type === 'sos';
      const photoUrl = getAuthorPhotoUrl(post.author_photo);
      const authorInitial = post.author_name ? post.author_name.charAt(0).toUpperCase() : 'U';
      const isResolved = post.status === 'resolved';

      return (
        <TouchableOpacity
          style={[styles.postCard, isSos && (isResolved ? styles.postCardSosResolved : styles.postCardSos)]}
          activeOpacity={0.88}
          onPress={() => openPostDetail(post)}
        >
          {isSos ? (
            <View style={[styles.sosTag, isResolved && styles.sosTagResolved]}>
              <Text style={styles.sosTagText}>
                {isResolved ? 'S.O.S. RESOLVED' : 'MASKPRO S.O.S.'}
              </Text>
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
          <Text style={styles.postBody} numberOfLines={4}>
            {post.body}
          </Text>

          <View style={styles.postFooter}>
            <View style={styles.commentCount}>
              <FontAwesome name="comment-o" size={14} color="#64748b" style={styles.commentIcon} />
              <Text style={styles.commentText}>{post.comment_count || 0} Comments</Text>
            </View>

            {isSos && !isResolved ? (
              <TouchableOpacity
                style={styles.helpButton}
                activeOpacity={0.75}
                onPress={() => openPostDetail(post, true)}
              >
                <FontAwesome name="life-ring" size={12} color="#ef4444" style={styles.helpIcon} />
                <Text style={styles.helpButtonText}>Offer Help</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </TouchableOpacity>
      );
    },
    []
  );

  return (
    <View style={styles.container}>
      {/* Feed List with FlatList for performance */}
      <FlatList
        data={posts}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderPostCard}
        contentContainerStyle={styles.feed}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4f46e5']} />
        }
        ListHeaderComponent={
          <View style={styles.communityHeader}>
            <Text style={styles.communityTitle}>Community Care</Text>
            <Text style={styles.communitySubtitle}>
              Connect with fellow drivers, ask maintenance questions, and request emergency roadside help.
            </Text>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color="#4f46e5" style={styles.loader} />
          ) : (
            <EmptyState
              icon="users"
              title="No posts yet"
              description="Be the first to start a discussion or ask for help in the Care Community!"
              actionText="Create Post"
              onAction={() => setIsPosting(true)}
            />
          )
        }
      />

      {/* Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setIsPosting(true)}
        activeOpacity={0.85}
      >
        <FontAwesome name="pencil" size={20} color="#ffffff" />
      </TouchableOpacity>

      {/* ─── CREATE POST MODAL ────────────────────────────────────── */}
      <Modal visible={isPosting} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsPosting(false)}>
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalHeaderTitle}>Create a Post</Text>
            <TouchableOpacity onPress={() => setIsPosting(false)} style={styles.modalCloseButton}>
              <FontAwesome name="times" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={[]}
            renderItem={null}
            contentContainerStyle={styles.formScroll}
            ListHeaderComponent={
              <View style={{ backgroundColor: 'transparent' }}>
                <View style={styles.typeSelector}>
                  <TouchableOpacity
                    style={[styles.typeButton, postType === 'discussion' && styles.typeActive]}
                    onPress={() => setPostType('discussion')}
                  >
                    <FontAwesome
                      name="comments-o"
                      size={16}
                      color={postType === 'discussion' ? '#1d4ed8' : '#6b7280'}
                      style={styles.selectorIcon}
                    />
                    <Text style={postType === 'discussion' ? styles.typeActiveText : styles.typeText}>
                      Discussion
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.typeButtonSos, postType === 'sos' && styles.typeActiveSos]}
                    onPress={() => setPostType('sos')}
                  >
                    <FontAwesome
                      name="exclamation-triangle"
                      size={16}
                      color={postType === 'sos' ? '#b91c1c' : '#6b7280'}
                      style={styles.selectorIcon}
                    />
                    <Text style={postType === 'sos' ? styles.typeActiveTextSos : styles.typeTextSos}>
                      MASKPRO S.O.S.
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>Title</Text>
                <TextInput
                  style={styles.input}
                  placeholder={
                    postType === 'sos'
                      ? 'E.g. Flat tire at J.P. Laurel Bajada, Davao, need help!'
                      : "E.g. What's the best tire wax for ceramic coating?"
                  }
                  value={title}
                  onChangeText={setTitle}
                  placeholderTextColor="#9ca3af"
                />

                <Text style={styles.label}>Details</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder={
                    postType === 'sos'
                      ? 'Guide: Where are you? What is your car model? What is the issue?\n\nExample: My car battery died at SM Lanang Premier parking. I drive a Toyota Fortuner. Can any techs or members nearby help?'
                      : 'Share your thoughts or ask a question...'
                  }
                  value={body}
                  onChangeText={setBody}
                  multiline
                  numberOfLines={6}
                  placeholderTextColor="#9ca3af"
                />

                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => setIsPosting(false)}
                    disabled={isSubmitting}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={postType === 'sos' ? styles.submitButtonSos : styles.submitButton}
                    onPress={handleCreatePost}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.submitButtonText}>Publish</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            }
          />
        </KeyboardAvoidingView>

        {/* Modal-level Alert Prompt Overlay */}
        <AlertPromptModal
          visible={alertModal.visible}
          type={alertModal.type}
          title={alertModal.title}
          message={alertModal.message}
          onConfirm={() => setAlertModal((prev) => ({ ...prev, visible: false }))}
          asOverlay
        />
      </Modal>

      {/* ─── POST DETAIL & COMMENTS MODAL ─────────────────────────── */}
      <Modal
        visible={selectedPost !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedPost(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalHeaderTitle} numberOfLines={1}>
              {selectedPost?.type === 'sos' ? 'MASKPRO S.O.S.' : 'Post & Comments'}
            </Text>
            <TouchableOpacity onPress={() => setSelectedPost(null)} style={styles.modalCloseButton}>
              <FontAwesome name="times" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          {selectedPost && (
            <FlatList
              data={comments}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.commentsListContent}
              ListHeaderComponent={
                <View style={styles.detailHeaderContainer}>
                  {/* Author Meta */}
                  <View style={styles.postHeader}>
                    {getAuthorPhotoUrl(selectedPost.author_photo) ? (
                      <Image
                        source={{ uri: getAuthorPhotoUrl(selectedPost.author_photo)! }}
                        style={styles.authorAvatar}
                      />
                    ) : (
                      <View style={styles.authorAvatarInitials}>
                        <Text style={styles.authorAvatarInitialsText}>
                          {selectedPost.author_name ? selectedPost.author_name.charAt(0).toUpperCase() : 'U'}
                        </Text>
                      </View>
                    )}

                    <View style={styles.authorMeta}>
                      <Text style={styles.authorName}>{selectedPost.author_name}</Text>
                      <Text style={styles.postTime}>{timeAgo(selectedPost.created_at)}</Text>
                    </View>
                  </View>

                  <Text style={styles.detailTitle}>{selectedPost.title}</Text>
                  <Text style={styles.detailBody}>{selectedPost.body}</Text>

                  {/* Resolve Button for SOS Owner */}
                  {selectedPost.type === 'sos' &&
                    selectedPost.status === 'open' &&
                    selectedPost.customer_id === user?.id && (
                      <TouchableOpacity
                        style={styles.resolveButton}
                        onPress={handleResolveSos}
                        disabled={isResolving}
                      >
                        {isResolving ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <>
                            <FontAwesome name="check-circle" size={14} color="#ffffff" style={{ marginRight: 6 }} />
                            <Text style={styles.resolveButtonText}>Mark as Resolved</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}

                  <View style={styles.commentsDivider}>
                    <Text style={styles.commentsHeading}>
                      Comments ({comments.length})
                    </Text>
                  </View>

                  {commentsLoading ? (
                    <ActivityIndicator size="small" color="#4f46e5" style={{ marginVertical: 20 }} />
                  ) : comments.length === 0 ? (
                    <Text style={styles.noCommentsText}>
                      No comments yet. Be the first to join the conversation!
                    </Text>
                  ) : null}
                </View>
              }
              renderItem={({ item: comment }) => {
                const commentPhoto = getAuthorPhotoUrl(comment.author_photo);
                const initial = comment.author_name ? comment.author_name.charAt(0).toUpperCase() : 'U';

                return (
                  <View style={styles.commentItem}>
                    {commentPhoto ? (
                      <Image source={{ uri: commentPhoto }} style={styles.commentAvatar} />
                    ) : (
                      <View style={styles.commentAvatarInitials}>
                        <Text style={styles.commentAvatarInitialsText}>{initial}</Text>
                      </View>
                    )}

                    <View style={styles.commentContent}>
                      <View style={styles.commentHeader}>
                        <Text style={styles.commentAuthorName}>{comment.author_name}</Text>
                        {comment.is_tech ? (
                          <View style={styles.techBadge}>
                            <Text style={styles.techBadgeText}>Tech</Text>
                          </View>
                        ) : null}
                        <Text style={styles.commentTime}>{timeAgo(comment.created_at)}</Text>
                      </View>
                      <Text style={styles.commentBodyText}>{comment.body}</Text>
                    </View>
                  </View>
                );
              }}
            />
          )}

          {/* Sticky Comment Input Bar */}
          <View style={styles.commentInputContainer}>
            <TextInput
              style={styles.commentTextInput}
              placeholder="Write a comment or offer assistance..."
              placeholderTextColor="#9ca3af"
              value={commentText}
              onChangeText={setCommentText}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[
                styles.commentSendButton,
                (!commentText.trim() || isSubmittingComment) && styles.commentSendButtonDisabled,
              ]}
              onPress={handleAddComment}
              disabled={!commentText.trim() || isSubmittingComment}
            >
              {isSubmittingComment ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <FontAwesome name="send" size={14} color="#ffffff" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

        {/* Modal-level Alert Prompt Overlay */}
        <AlertPromptModal
          visible={alertModal.visible}
          type={alertModal.type}
          title={alertModal.title}
          message={alertModal.message}
          onConfirm={() => setAlertModal((prev) => ({ ...prev, visible: false }))}
          asOverlay
        />
      </Modal>

      {/* Modern Modal Alert Prompt */}
      <AlertPromptModal
        visible={alertModal.visible}
        type={alertModal.type}
        title={alertModal.title}
        message={alertModal.message}
        onConfirm={() => setAlertModal(prev => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  feed: {
    padding: 16,
    paddingBottom: 96,
  },
  communityHeader: {
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  communityTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
  },
  communitySubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    lineHeight: 18,
    marginBottom: 12,
  },
  loader: {
    marginTop: 40,
  },
  postCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  postCardSos: {
    borderColor: '#fca5a5',
    backgroundColor: '#fff',
    shadowColor: '#ef4444',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  postCardSosResolved: {
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
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
  sosTagResolved: {
    backgroundColor: '#16a34a',
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
    color: '#0f172a',
    marginBottom: 8,
  },
  postBody: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 14,
  },
  postFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
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
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
  },
  helpIcon: {
    marginRight: 5,
  },
  helpButtonText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#4f46e5',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    flex: 1,
  },
  modalCloseButton: {
    padding: 6,
  },
  formScroll: {
    padding: 20,
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
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  typeActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  typeButtonSos: {
    flex: 1,
    flexDirection: 'row',
    padding: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  typeActiveSos: {
    backgroundColor: '#fef2f2',
    borderColor: '#ef4444',
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
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#1e293b',
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 24,
    backgroundColor: 'transparent',
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  cancelButtonText: {
    color: '#475569',
    fontWeight: '700',
  },
  submitButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: '#4f46e5',
  },
  submitButtonSos: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: '#ef4444',
  },
  submitButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  commentsListContent: {
    padding: 20,
    paddingBottom: 24,
  },
  detailHeaderContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 16,
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
  },
  detailBody: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 22,
    marginBottom: 16,
  },
  resolveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16a34a',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  resolveButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  commentsDivider: {
    marginTop: 8,
    marginBottom: 12,
    backgroundColor: 'transparent',
  },
  commentsHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  noCommentsText: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },
  commentAvatarInitials: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  commentAvatarInitialsText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  commentContent: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    backgroundColor: 'transparent',
  },
  commentAuthorName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
    marginRight: 6,
  },
  techBadge: {
    backgroundColor: '#dbeafe',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginRight: 6,
  },
  techBadgeText: {
    color: '#1d4ed8',
    fontSize: 10,
    fontWeight: '700',
  },
  commentTime: {
    fontSize: 10,
    color: '#94a3b8',
    marginLeft: 'auto',
  },
  commentBodyText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  commentTextInput: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 80,
    fontSize: 14,
    color: '#1e293b',
    marginRight: 10,
  },
  commentSendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentSendButtonDisabled: {
    opacity: 0.4,
  },
});
