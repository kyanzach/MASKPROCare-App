import React, { useState } from 'react';
import { StyleSheet, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Text, View } from '@/components/Themed';
import FontAwesome from '@expo/vector-icons/FontAwesome';

export default function CommunityScreen() {
  const [posts, setPosts] = useState([]);
  const [isPosting, setIsPosting] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [postType, setPostType] = useState('discussion'); // 'sos' or 'discussion'

  const handleSubmit = () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Error', 'Please provide both title and details.');
      return;
    }

    // Call API here
    Alert.alert('Submitted', 'Your post has been submitted.');
    setTitle('');
    setBody('');
    setIsPosting(false);
  };

  if (isPosting) {
    return (
      <View style={styles.container}>
        <ScrollView style={styles.formContainer}>
          <Text style={styles.title}>Create a Post</Text>
          
          <View style={styles.typeSelector}>
            <TouchableOpacity 
              style={[styles.typeButton, postType === 'discussion' && styles.typeActive]}
              onPress={() => setPostType('discussion')}
            >
              <Text style={postType === 'discussion' ? styles.typeActiveText : styles.typeText}>Discussion</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.typeButtonSos, postType === 'sos' && styles.typeActiveSos]}
              onPress={() => setPostType('sos')}
            >
              <Text style={postType === 'sos' ? styles.typeActiveTextSos : styles.typeTextSos}>MASKPRO S.O.S.</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            placeholder={postType === 'sos' ? "E.g. Flat tire at EDSA Ayala" : "E.g. What's the best tire wax?"}
            value={title}
            onChangeText={setTitle}
            placeholderTextColor="#999"
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
            placeholderTextColor="#999"
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setIsPosting(false)}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={postType === 'sos' ? styles.submitButtonSos : styles.submitButton} onPress={handleSubmit}>
              <Text style={styles.submitButtonText}>Publish</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.feed}>
        {/* Placeholder for feed */}
        <View style={styles.emptyState}>
          <FontAwesome name="users" size={48} color="#4f46e5" style={{ opacity: 0.5 }} />
          <Text style={styles.emptyText}>Welcome to the Care Community.</Text>
          <Text style={styles.emptySubtext}>Ask questions or request MASKPRO S.O.S. emergency help.</Text>
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setIsPosting(true)}>
        <FontAwesome name="plus" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  feed: {
    padding: 16,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
    backgroundColor: 'transparent',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    color: '#374151',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  formContainer: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#111827',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
  },
  textArea: {
    height: 150,
    textAlignVertical: 'top',
  },
  typeSelector: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: 'transparent',
  },
  typeButton: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  typeActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  typeText: {
    color: '#6b7280',
    fontWeight: '600',
  },
  typeActiveText: {
    color: '#1d4ed8',
    fontWeight: 'bold',
  },
  typeButtonSos: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: '#d1d5db',
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  typeActiveSos: {
    backgroundColor: '#fef2f2',
    borderColor: '#ef4444',
  },
  typeTextSos: {
    color: '#6b7280',
    fontWeight: '600',
  },
  typeActiveTextSos: {
    color: '#b91c1c',
    fontWeight: 'bold',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 32,
    backgroundColor: 'transparent',
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
    marginRight: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#374151',
    fontWeight: 'bold',
    fontSize: 16,
  },
  submitButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#4f46e5',
    marginLeft: 8,
    alignItems: 'center',
  },
  submitButtonSos: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#dc2626',
    marginLeft: 8,
    alignItems: 'center',
    shadowColor: '#dc2626',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
