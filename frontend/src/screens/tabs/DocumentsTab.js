import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { api } from '../../api/client';
import { colors } from '../../theme';

const OVERALL_COLOR = { pass: colors.success, 'needs-review': colors.warning, fail: colors.danger };

export default function DocumentsTab({ app, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function pickAndUpload() {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];

    const form = new FormData();
    if (Platform.OS === 'web') {
      // Some browsers don't populate asset.file — fall back to fetching the blob URI.
      const file = asset.file ?? (await (await fetch(asset.uri)).blob());
      form.append('file', file, asset.name);
    } else {
      form.append('file', { uri: asset.uri, name: asset.name, type: asset.mimeType || 'image/jpeg' });
    }

    setBusy(true);
    try {
      await api.uploadDocument(app._id, form);
      onChanged(); // refetch application incl. new document + verification
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {app.missingDocuments?.length > 0 && (
        <View style={styles.missingBox}>
          <Text style={styles.missingTitle}>Still needed</Text>
          {app.missingDocuments.map((d) => (
            <Text key={d} style={styles.missingItem}>
              • {d.replace(/-/g, ' ')}
            </Text>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.uploadBtn} onPress={pickAndUpload} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.uploadText}>＋ Upload document</Text>
        )}
      </TouchableOpacity>
      {busy && <Text style={styles.busyHint}>AI is classifying and extracting…</Text>}
      {error && <Text style={styles.error}>{error}</Text>}

      {(app.documents || []).map((doc) => (
        <View key={doc._id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.docType}>{(doc.docType || 'unknown').replace(/-/g, ' ')}</Text>
            <View
              style={[
                styles.badge,
                { backgroundColor: OVERALL_COLOR[doc.verification?.overall] || colors.muted },
              ]}
            >
              <Text style={styles.badgeText}>{doc.verification?.overall}</Text>
            </View>
          </View>
          <Text style={styles.confidence}>
            Extraction confidence: {Math.round((doc.confidence || 0) * 100)}%
          </Text>
          {Object.entries(doc.extractedFields || {})
            .filter(([, v]) => v != null)
            .map(([k, v]) => (
              <View key={k} style={styles.fieldRow}>
                <Text style={styles.fieldKey}>{k}</Text>
                <Text style={styles.fieldVal}>{String(v)}</Text>
              </View>
            ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  missingBox: {
    backgroundColor: '#FFF7E6',
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  missingTitle: { fontWeight: '800', color: colors.warning, marginBottom: 4 },
  missingItem: { color: colors.text, textTransform: 'capitalize' },
  uploadBtn: { backgroundColor: colors.accent, borderRadius: 10, padding: 14, alignItems: 'center' },
  uploadText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  busyHint: { textAlign: 'center', color: colors.muted, marginTop: 8 },
  error: { color: colors.danger, marginTop: 8 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginTop: 12,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  docType: { fontWeight: '800', fontSize: 16, color: colors.text, textTransform: 'capitalize' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  confidence: { color: colors.muted, fontSize: 12, marginTop: 4, marginBottom: 8 },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  fieldKey: { color: colors.muted },
  fieldVal: { color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
