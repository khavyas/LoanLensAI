import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { api } from '../api/client';
import { colors } from '../theme';
import { Card, Overline } from '../components/ui';

export default function RagAdminScreen() {
  const [documents, setDocuments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const result = await api.ragDocuments();
      setDocuments(result.documents || []);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function pickAndUpload() {
    setError('');
    setNotice('');
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/markdown', 'text/plain', 'application/pdf'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const form = new FormData();
    for (const asset of result.assets || []) {
      if (Platform.OS === 'web') {
        const file = asset.file ?? (await (await fetch(asset.uri)).blob());
        form.append('files', file, asset.name);
      } else {
        form.append('files', { uri: asset.uri, name: asset.name, type: asset.mimeType || 'text/markdown' });
      }
    }
    setBusy(true);
    try {
      const response = await api.uploadRagDocuments(form);
      const uploaded = response.uploaded || [];
      const failures = response.errors || [];
      setNotice(
        uploaded.length
          ? 'Indexed ' + uploaded.length + ' file(s) into ' + uploaded.reduce((sum, item) => sum + item.chunks, 0) + ' searchable policy chunks.'
          : 'No documents were indexed.'
      );
      if (failures.length) setError(failures.map((item) => item.file + ': ' + item.error).join('\n'));
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(document) {
    const remove = async () => {
      setDeletingId(document.documentId);
      setError('');
      setNotice('');
      try {
        await api.deleteRagDocument(document.documentId);
        setNotice(document.sourceFile + ' was removed from policy retrieval.');
        await load();
      } catch (e) {
        setError(e.message);
      } finally {
        setDeletingId(null);
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Remove ' + document.sourceFile + ' and its indexed chunks from RAG?')) remove();
      return;
    }
    Alert.alert('Remove policy document?', 'This removes ' + document.sourceFile + ' from Chroma.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: remove },
    ]);
  }

  return (
    <View style={styles.wrap}>
      <FlatList
        data={documents}
        keyExtractor={(item) => item.documentId}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Overline>Administrator workspace</Overline>
            <Text style={styles.title}>RAG policy documents</Text>
            <Text style={styles.description}>
              Upload approved loan policy and FAQ files. Their text is chunked, embedded with the configured Ollama model, and stored in the connected Chroma database for chatbot retrieval.
            </Text>
            <Card style={styles.info}>
              <Text style={styles.infoText}>Supported: Markdown (.md), text (.txt), and text based PDF (.pdf). Up to 10 files per upload, 10 MB per file. Scanned PDFs need OCR before upload. Borrower application uploads are not included here.</Text>
            </Card>
            <TouchableOpacity style={styles.uploadButton} onPress={pickAndUpload} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.uploadText}>Choose and index policy documents</Text>}
            </TouchableOpacity>
            {!!notice && <Text style={styles.notice}>{notice}</Text>}
            {!!error && <Text style={styles.error}>{error}</Text>}
            <View style={styles.listHeader}>
              <Text style={styles.sectionTitle}>Indexed documents</Text>
              <TouchableOpacity onPress={load}><Text style={styles.refresh}>Refresh</Text></TouchableOpacity>
            </View>
          </>
        }
        ListEmptyComponent={<Text style={styles.empty}>No policy documents are indexed yet.</Text>}
        renderItem={({ item }) => (
          <Card style={styles.document}>
            <View style={styles.documentInfo}>
              <Text style={styles.documentTitle}>{item.sourceTitle}</Text>
              <Text style={styles.filename}>{item.sourceFile}</Text>
              <Text style={styles.meta}>{item.chunks} searchable chunks</Text>
            </View>
            <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDelete(item)} disabled={deletingId === item.documentId}>
              {deletingId === item.documentId ? <ActivityIndicator color={colors.danger} size="small" /> : <Text style={styles.deleteText}>Remove</Text>}
            </TouchableOpacity>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  content: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 24, paddingBottom: 48 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', marginTop: 3 },
  description: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 16 },
  info: { marginBottom: 14, borderColor: '#D1E4FF', backgroundColor: colors.infoBg },
  infoText: { color: colors.info, fontSize: 13, lineHeight: 19 },
  uploadButton: { minHeight: 46, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginBottom: 12 },
  uploadText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  notice: { color: colors.success, fontSize: 13, marginBottom: 10, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 13, marginBottom: 10, lineHeight: 19 },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 8 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  refresh: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  empty: { color: colors.muted, paddingVertical: 16 },
  document: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  documentInfo: { flex: 1, paddingRight: 12 },
  documentTitle: { color: colors.text, fontWeight: '700', fontSize: 14 },
  filename: { color: colors.muted, fontSize: 12, marginTop: 3 },
  meta: { color: colors.faint, fontSize: 11, marginTop: 4 },
  deleteButton: { minWidth: 68, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8 },
  deleteText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
});
