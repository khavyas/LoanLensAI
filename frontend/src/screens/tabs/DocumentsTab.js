import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { api } from '../../api/client';
import { colors, labelize } from '../../theme';
import { Pill, Card, Overline } from '../../components/ui';

const OVERALL_TONE = { pass: 'success', 'needs-review': 'warning', fail: 'danger' };

export default function DocumentsTab({ app, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const receivedTypes = new Set((app.documents || []).map((d) => d.docType));

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
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Card style={{ marginBottom: 12 }}>
        <Overline>Required documents</Overline>
        {(app.requiredDocTypes || []).map((t) => {
          const received = receivedTypes.has(t);
          return (
            <View key={t} style={styles.reqRow}>
              <View style={[styles.dot, { backgroundColor: received ? colors.success : colors.faint }]} />
              <Text style={styles.reqName}>{labelize(t)}</Text>
              <Pill tone={received ? 'success' : 'neutral'}>{received ? 'Received' : 'Pending'}</Pill>
            </View>
          );
        })}
      </Card>

      <TouchableOpacity style={styles.uploadBtn} onPress={pickAndUpload} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.uploadText}>Upload document</Text>
        )}
      </TouchableOpacity>
      {busy && <Text style={styles.busyHint}>AI is classifying and extracting…</Text>}
      {error && <Text style={styles.error}>{error}</Text>}

      {(app.documents || []).map((doc) => (
        <Card key={doc._id} style={{ marginTop: 12 }}>
          <View style={styles.cardHeader}>
            <Text style={styles.docType}>{labelize(doc.docType || 'unknown')}</Text>
            <Pill tone={OVERALL_TONE[doc.verification?.overall] || 'neutral'}>
              {labelize(doc.verification?.overall || 'pending')}
            </Pill>
          </View>
          <Text style={styles.confidence}>
            Extraction confidence · {Math.round((doc.confidence || 0) * 100)}%
          </Text>
          {Object.entries(doc.extractedFields || {})
            .filter(([, v]) => v != null)
            .map(([k, v]) => (
              <View key={k} style={styles.fieldRow}>
                <Text style={styles.fieldKey}>{labelize(k.replace(/([A-Z])/g, '-$1'))}</Text>
                <Text style={styles.fieldVal}>{String(v)}</Text>
              </View>
            ))}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  reqRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  reqName: { flex: 1, color: colors.text, fontWeight: '600', fontSize: 14 },
  uploadBtn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  uploadText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  busyHint: { textAlign: 'center', color: colors.muted, marginTop: 8, fontSize: 13 },
  error: { color: colors.danger, marginTop: 8, fontSize: 13 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  docType: { fontWeight: '800', fontSize: 16, color: colors.text },
  confidence: { color: colors.faint, fontSize: 12, marginTop: 4, marginBottom: 8 },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  fieldKey: { color: colors.muted, fontSize: 13 },
  fieldVal: { color: colors.text, fontWeight: '600', fontSize: 13, flexShrink: 1, textAlign: 'right' },
});
