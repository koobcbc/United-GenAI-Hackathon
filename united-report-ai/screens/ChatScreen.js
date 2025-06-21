import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { db, storage } from '../firebase';
import { collection, addDoc, doc, setDoc, query, where, orderBy, getDocs, serverTimestamp, increment } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const ChatScreen = ({ navigation, route }) => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: "Hello! I'm your AI assistant for United Airlines. I can help you create reports for customer complaints, service issues, or any airline-related problems. You can upload images and I'll analyze them to help generate comprehensive reports. What type of issue would you like to report today?",
      sender: 'ai',
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [uploadedImages, setUploadedImages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [chatId, setChatId] = useState(null);
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef();

  // Check if we're viewing an existing report
  const existingReport = route.params?.report;

  console.log(existingReport);

  const reportTypes = [
    'Lost Baggage',
    'Damaged Baggage',
    'Damaged Aircraft Infrastructure',
  ];

  // Load existing chat or create new one
  useEffect(() => {
    const initializeChat = async () => {
        console.log('existingReport', existingReport)
      if (existingReport && existingReport.chat_id) {
        // Load existing chat
        setChatId(existingReport.chat_id);
        await loadExistingChat(existingReport.chat_id);
      } else {
        // Create new chat
        const newChatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setChatId(newChatId);
      }
    };

    initializeChat();
  }, [existingReport]);

  const loadExistingChat = async (chatId) => {
    try {
      setLoading(true);
      const q = query(
        collection(db, 'report-messages'),
        where('chat_id', '==', chatId),
        orderBy('timestamp', 'asc')
      );
      const messagesSnapshot = await getDocs(q);

      const messagesData = messagesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date(),
      }));

      console.log(messagesData);

      if (messagesData.length > 0) {
        setMessages(messagesData);
      }
    } catch (error) {
      console.error('Error loading chat messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveMessageToFirestore = async (message) => {
    if (!chatId) return;
    
    try {
      // Save message to report-messages collection
      await addDoc(collection(db, 'report-messages'), {
        chat_id: chatId,
        text: message.text,
        sender: message.sender,
        timestamp: serverTimestamp(),
        images: message.images || null,
      });
      
      // Update the chat metadata in report-chats collection
      await setDoc(doc(db, 'report-chats', chatId), {
        lastMessage: message.text,
        lastMessageTime: serverTimestamp(),
        messageCount: increment(1),
        createdAt: serverTimestamp(),
      }, { merge: true });
      
    } catch (error) {
      console.error('Error saving message to Firestore:', error);
    }
  };

  const uploadImageToStorage = async (imageUri) => {
    try {
      // Create a unique filename
      const filename = `report-images/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
      const storageRef = ref(storage, filename);
      
      // Convert image URI to blob
      const response = await fetch(imageUri);
      const blob = await response.blob();
      
      // Upload to Firebase Storage
      const snapshot = await uploadBytes(storageRef, blob);
      
      // Get download URL
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      return downloadURL;
    } catch (error) {
      console.error('Error uploading image to Storage:', error);
      throw error;
    }
  };

  const handleSendMessage = async () => {
    if (inputText.trim() === '') return;

    const userMessage = {
      id: Date.now(),
      text: inputText,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);

    // Save user message to Firestore
    await saveMessageToFirestore(userMessage);

    // Simulate AI response
    setTimeout(async () => {
      const aiResponse = generateAIResponse(inputText);
      setMessages(prev => [...prev, aiResponse]);
      setIsTyping(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      // Save AI response to Firestore
      await saveMessageToFirestore(aiResponse);
    }, 1500);
  };

  const generateAIResponse = (userInput) => {
    const responses = [
      "I understand your concern. Let me help you document this issue properly. Could you provide more details about when this occurred?",
      "Thank you for reporting this. I'm analyzing the information you've provided. Is there anything else you'd like to add?",
      "I've noted this in your report. Based on the images and information provided, I can help escalate this to the appropriate department.",
      "This is important information. Let me create a comprehensive report with all the details you've shared.",
    ];
    
    return {
      id: Date.now() + 1,
      text: responses[Math.floor(Math.random() * responses.length)],
      sender: 'ai',
      timestamp: new Date(),
    };
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Please grant permission to access your photo library to upload images.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      try {
        // Upload images to Firebase Storage
        const uploadPromises = result.assets.map(asset => uploadImageToStorage(asset.uri));
        const downloadURLs = await Promise.all(uploadPromises);
        
        const newImages = downloadURLs.map((url, index) => ({
          id: Date.now() + Math.random(),
          uri: url,
          timestamp: new Date(),
        }));
        
        setUploadedImages(prev => [...prev, ...newImages]);
        
        // Add image message to chat
        const imageMessage = {
          id: Date.now(),
          text: `Uploaded ${result.assets.length} image(s)`,
          sender: 'user',
          timestamp: new Date(),
          images: downloadURLs.map(url => ({ uri: url })),
        };
        
        setMessages(prev => [...prev, imageMessage]);
        
        // Save image message to Firestore
        await saveMessageToFirestore(imageMessage);
        
        // AI response for images
        setTimeout(async () => {
          const aiImageResponse = {
            id: Date.now() + 1,
            text: "I can see the images you've uploaded. I'm analyzing them to help with your report. Could you describe what these images show?",
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, aiImageResponse]);
          
          // Save AI response to Firestore
          await saveMessageToFirestore(aiImageResponse);
        }, 1000);
      } catch (error) {
        console.error('Error uploading images:', error);
        Alert.alert('Error', 'Failed to upload images. Please try again.');
      }
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Please grant permission to access your camera to take photos.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled) {
      try {
        // Upload photo to Firebase Storage
        const downloadURL = await uploadImageToStorage(result.assets[0].uri);
        
        const newImage = {
          id: Date.now(),
          uri: downloadURL,
          timestamp: new Date(),
        };
        
        setUploadedImages(prev => [...prev, newImage]);
        
        const imageMessage = {
          id: Date.now(),
          text: 'Photo taken',
          sender: 'user',
          timestamp: new Date(),
          images: [{ uri: downloadURL }],
        };
        
        setMessages(prev => [...prev, imageMessage]);
        
        // Save photo message to Firestore
        await saveMessageToFirestore(imageMessage);
        
        // AI response for photo
        setTimeout(async () => {
          const aiPhotoResponse = {
            id: Date.now() + 1,
            text: "I can see the photo you've taken. I'm analyzing it to help with your report. Could you describe what this image shows?",
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, aiPhotoResponse]);
          
          // Save AI response to Firestore
          await saveMessageToFirestore(aiPhotoResponse);
        }, 1000);
      } catch (error) {
        console.error('Error uploading photo:', error);
        Alert.alert('Error', 'Failed to upload photo. Please try again.');
      }
    }
  };

  const renderMessage = ({ item }) => (
    <View style={[
      styles.messageContainer,
      item.sender === 'user' ? styles.userMessage : styles.aiMessage
    ]}>
      <View style={[
        styles.messageBubble,
        item.sender === 'user' ? styles.userBubble : styles.aiBubble
      ]}>
        <Text style={[
          styles.messageText,
          item.sender === 'user' ? styles.userText : styles.aiText
        ]}>
          {item.text}
        </Text>
        
        {item.images && (
          <View style={styles.imageContainer}>
            {item.images.map((image, index) => (
              <Image
                key={index}
                source={{ uri: image.uri }}
                style={styles.messageImage}
                resizeMode="cover"
              />
            ))}
          </View>
        )}
        
        <Text style={styles.timestamp}>
          {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {existingReport ? existingReport.title : 'New Report'}
        </Text>
      </View>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Report Type Selection */}
        {(!existingReport || existingReport.status !== 'Completed') && (
          <View style={styles.reportTypeContainer}>
            <Text style={styles.reportTypeTitle}>Report Type:</Text>
            <FlatList
              horizontal
              data={reportTypes}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.reportTypeButton}>
                  <Text style={styles.reportTypeText}>{item}</Text>
                </TouchableOpacity>
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.reportTypeList}
            />
          </View>
        )}

        {/* Chat Messages */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading chat...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id.toString()}
            style={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
            onLayout={() => flatListRef.current?.scrollToEnd()}
          />
        )}

        {/* Typing Indicator */}
        {isTyping && (
          <View style={styles.typingContainer}>
            <Text style={styles.typingText}>AI is typing...</Text>
          </View>
        )}

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.attachButton} onPress={pickImage}>
              <Ionicons name="image" size={24} color="#007AFF" />
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.cameraButton} onPress={takePhoto}>
              <Ionicons name="camera" size={24} color="#007AFF" />
            </TouchableOpacity>
            
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type your message..."
              multiline
              maxLength={500}
            />
            
            <TouchableOpacity 
              style={[styles.sendButton, inputText.trim() === '' && styles.sendButtonDisabled]}
              onPress={handleSendMessage}
              disabled={inputText.trim() === ''}
            >
              <Ionicons name="send" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginLeft: 15,
  },
  reportTypeContainer: {
    backgroundColor: '#fff',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  reportTypeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  reportTypeList: {
    paddingHorizontal: 5,
  },
  reportTypeButton: {
    backgroundColor: '#f0f8ff',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  reportTypeText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
  messagesList: {
    flex: 1,
    padding: 15,
  },
  messageContainer: {
    marginBottom: 15,
  },
  userMessage: {
    alignItems: 'flex-end',
  },
  aiMessage: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: '#007AFF',
  },
  aiBubble: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: '#fff',
  },
  aiText: {
    color: '#333',
  },
  imageContainer: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  messageImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginRight: 5,
    marginBottom: 5,
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
    alignSelf: 'flex-end',
  },
  typingContainer: {
    padding: 15,
    alignItems: 'flex-start',
  },
  typingText: {
    color: '#666',
    fontStyle: 'italic',
  },
  inputContainer: {
    backgroundColor: '#fff',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  attachButton: {
    padding: 8,
    marginRight: 5,
  },
  cameraButton: {
    padding: 8,
    marginRight: 5,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#f8f8f8',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '500',
    marginTop: 10,
  },
});

export default ChatScreen; 