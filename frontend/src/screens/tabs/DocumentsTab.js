import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { api } from '../../api/client';
import { colors, labelize } from '../../theme';
import { Pill, Card, Overline } from '../../components/ui';

const OVERALL_TONE = { pass: 'success', 'needs-review': 'warning', fail: 'danger' };
const REQ_STATUS_TONE = { pending: 'neutral', received: 'success', 'needs-attention': 'warning' };
const REQ_STATUS_LABEL = { pending: 'Pending', received: 'Received', 'needs-attention': 'Needs attention' };

export default function DocumentsTab({ app, onChanged }) {
  const [busyDocType, setBusyDocType] = useState(null); // which fix is uploading, or '__generic__'
  const [error, setError] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  const allDocs = app.documents || [];
  const currentDocs = allDocs.filter((d) => (d.status || 'current') === 'current');
  const historyDocs = allDocs.filter((d) => d.status === 'superseded');
  const currentByType = new Map(currentDocs.map((d) => [d.docType, d]));
  const exceptions = app.openExceptions || [];

  async function pickAndUpload(expectedDocType) {
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
    if (expectedDocType) form.append('expectedDocType', expectedDocType);

    setBusyDocType(expectedDocType || '__generic__');
    try {
      await api.uploadDocument(app._id, form);
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyDocType(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {exceptions.length > 0 && (
        <Card style={{ marginBottom: 12, borderColor: colors.warning, borderWidth: 1 }}>
          <Overline>Action needed · {exceptions.length}</Overline>
          {exceptions.map((ex, i) => {
            const key = ex.documentId || ex.docType + i;
            const isBusy = busyDocType === ex.docType;
            return (
              <View key={key} style={styles.exceptionRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.exceptionTitle}>{labelize(ex.docType)}</Text>
                  <Text style={styles.exceptionMsg}>{ex.message}</Text>
                </View>
                <TouchableOpacity
                  style={styles.fixBtn}
                  onPress={() => pickAndUpload(ex.docType)}
                  disabled={busyDocType != null}
                >
                  {isBusy ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.fixBtnText}>{ex.type === 'missing' ? 'Upload' : 'Re-upload'}</Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </Card>
      )}

      <Card style={{ marginBottom: 12 }}>
        <Overline>Required documents</Overline>
        {(app.requiredDocTypes || []).map((t) => {
          const doc = currentByType.get(t);
          const status = !doc ? 'pending' : doc.verification?.overall === 'pass' ? 'received' : 'needs-attention';
          return (
            <View key={t} style={styles.reqRow}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: status === 'received' ? colors.success : status === 'needs-attention' ? colors.warning : colors.faint },
                ]}
              />
              <Text style={styles.reqName}>{labelize(t)}</Text>
              <Pill tone={REQ_STATUS_TONE[status]}>{REQ_STATUS_LABEL[status]}</Pill>
            </View>
          );
        })}
      </Card>

      <TouchableOpacity
        style={styles.uploadBtn}
        onPress={() => pickAndUpload()}
        disabled={busyDocType != null}
      >
        {busyDocType === '__generic__' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.uploadText}>Upload document</Text>
        )}
      </TouchableOpacity>
      {busyDocType && <Text style={styles.busyHint}>AI is classifying and extracting…</Text>}
      {error && <Text style={styles.error}>{error}</Text>}

      {currentDocs.map((doc) => (
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

      {historyDocs.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <TouchableOpacity onPress={() => setShowHistory((s) => !s)}>
            <Text style={styles.historyToggle}>
              {showHistory ? 'Hide' : 'Show'} document history ({historyDocs.length} superseded)
            </Text>
          </TouchableOpacity>
          {showHistory &&
            historyDocs.map((doc) => (
              <Card key={doc._id} style={{ marginTop: 8, opacity: 0.6 }}>
                <View style={styles.cardHeader}>
                  <Text style={styles.docType}>{labelize(doc.docType || 'unknown')}</Text>
                  <Pill tone="neutral">Superseded</Pill>
                </View>
                <Text style={styles.confidence}>{doc.fileName}</Text>
              </Card>
            ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  reqRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  reqName: { flex: 1, color: colors.text, fontWeight: '600', fontSize: 14 },
  exceptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  exceptionTitle: { fontWeight: '700', fontSize: 14, color: colors.text },
  exceptionMsg: { color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 17 },
  fixBtn: {
    backgroundColor: colors.warning,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
    minWidth: 88,
    alignItems: 'center',
  },
  fixBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
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
  historyToggle: { color: colors.accent, fontWeight: '600', fontSize: 13, textAlign: 'center' },
});
