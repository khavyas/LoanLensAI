import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { api } from '../../api/client';
import { colors, labelize } from '../../theme';
import { Pill, Card, Overline } from '../../components/ui';

const OVERALL_TONE = { pass: 'success', 'needs-review': 'warning', fail: 'danger' };
const REQ_STATUS_TONE = { pending: 'neutral', received: 'success', 'needs-attention': 'warning' };
const REQ_STATUS_LABEL = { pending: 'Pending', received: 'Received', 'needs-attention': 'Needs attention' };
// A flagged document can carry several distinct issues (name mismatch,
// revenue mismatch, affordability, ...) — each gets its own row instead of
// being run together into one paragraph, so it reads as a checklist, not a
// wall of text.
const ISSUE_TONE = { mismatch: 'danger', warning: 'warning' };
const ISSUE_LABEL = { mismatch: 'Mismatch', warning: 'Review' };
const ISSUE_ACCENT = { mismatch: colors.danger, warning: colors.warning };

export default function DocumentsTab({ app, onChanged }) {
  const [busyDocType, setBusyDocType] = useState(null); // which fix is uploading, or '__generic__'
  const [error, setError] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [busyDocId, setBusyDocId] = useState(null); // which document's preview/delete is in flight

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

  async function onPreview(documentId) {
    setError(null);
    // Open the tab synchronously, in direct response to the tap, so the
    // browser doesn't treat the file arriving a moment later (after the
    // authenticated fetch resolves) as a blocked popup.
    const win = Platform.OS === 'web' ? window.open('', '_blank') : null;
    setBusyDocId(documentId);
    try {
      const blob = await api.fetchDocumentBlob(documentId);
      const url = URL.createObjectURL(blob);
      if (win) win.location.href = url;
    } catch (e) {
      if (win) win.close();
      setError(e.message);
    } finally {
      setBusyDocId(null);
    }
  }

  // react-native-web's Alert.alert() is a documented no-op on web — using it
  // directly here would make Delete silently do nothing when clicked in a
  // browser (no dialog, no callback, no error). window.confirm is the actual
  // working equivalent on web; Alert.alert works correctly on native.
  function confirmDelete() {
    if (Platform.OS === 'web') {
      return Promise.resolve(window.confirm('Delete this document? This removes it permanently.'));
    }
    return new Promise((resolve) => {
      Alert.alert(
        'Delete this document?',
        'This removes it permanently — the item goes back to "missing" if it was required.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
        ]
      );
    });
  }

  async function onDelete(documentId) {
    const confirmed = await confirmDelete();
    if (!confirmed) return;
    setError(null);
    setBusyDocId(documentId);
    try {
      await api.deleteDocument(documentId);
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyDocId(null);
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
              <View key={key} style={styles.exceptionBlock}>
                <View style={styles.exceptionHeader}>
                  <Text style={styles.exceptionTitle}>
                    {labelize(ex.docType)}
                    {ex.checks?.length > 1 ? ` · ${ex.checks.length} issues` : ''}
                  </Text>
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

                {ex.type === 'missing' ? (
                  <Text style={styles.exceptionMsg}>{ex.message}</Text>
                ) : (
                  (ex.checks || []).map((c, j) => (
                    <View key={j} style={[styles.issueRow, { borderLeftColor: ISSUE_ACCENT[c.status] }]}>
                      <View style={styles.issueHeader}>
                        <Text style={styles.issueField}>{c.field}</Text>
                        <Pill tone={ISSUE_TONE[c.status]}>{ISSUE_LABEL[c.status]}</Pill>
                      </View>
                      <Text style={styles.issueExplain}>{c.explanation}</Text>
                    </View>
                  ))
                )}
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

      {currentDocs.length > 0 && (
        <Text style={styles.sectionHeading}>Uploaded Documents</Text>
      )}
      {currentDocs.map((doc) => {
        const isBusy = busyDocId === doc._id;
        return (
          <Card key={doc._id} style={{ marginTop: 12 }}>
            <View style={styles.cardHeader}>
              <Text style={styles.docType}>{labelize(doc.docType || 'unknown')}</Text>
              <Pill tone={OVERALL_TONE[doc.verification?.overall] || 'neutral'}>
                {labelize(doc.verification?.overall || 'pending')}
              </Pill>
            </View>

            <View style={styles.fileRow}>
              <Text style={styles.fileName} numberOfLines={1}>📄 {doc.fileName || 'Untitled file'}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={styles.fileActionBtn}
                  onPress={() => onPreview(doc._id)}
                  disabled={isBusy}
                >
                  {isBusy ? (
                    <ActivityIndicator color={colors.accent} size="small" />
                  ) : (
                    <Text style={styles.fileActionText}>Preview</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.fileActionBtn, styles.fileActionBtnDanger]}
                  onPress={() => onDelete(doc._id)}
                  disabled={isBusy}
                >
                  <Text style={[styles.fileActionText, { color: colors.danger }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.confidence}>
              Extraction confidence · {Math.round((doc.confidence || 0) * 100)}%
            </Text>
            <Text style={styles.fieldsHeading}>Extracted fields</Text>
            {Object.entries(doc.extractedFields || {})
              .filter(([, v]) => v != null)
              .map(([k, v]) => (
                <View key={k} style={styles.fieldRow}>
                  <Text style={styles.fieldKey}>{labelize(k.replace(/([A-Z])/g, '-$1'))}</Text>
                  <Text style={styles.fieldVal}>{String(v)}</Text>
                </View>
              ))}
          </Card>
        );
      })}

      {historyDocs.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <TouchableOpacity onPress={() => setShowHistory((s) => !s)}>
            <Text style={styles.historyToggle}>
              {showHistory ? 'Hide' : 'Show'} document history ({historyDocs.length} superseded)
            </Text>
          </TouchableOpacity>
          {showHistory &&
            historyDocs.map((doc) => (
              <Card key={doc._id} style={{ marginTop: 8, opacity: 0.75 }}>
                <View style={styles.cardHeader}>
                  <Text style={styles.docType}>{labelize(doc.docType || 'unknown')}</Text>
                  <Pill tone="neutral">Superseded</Pill>
                </View>
                <View style={styles.fileRow}>
                  <Text style={styles.fileName} numberOfLines={1}>📄 {doc.fileName || 'Untitled file'}</Text>
                  <TouchableOpacity
                    style={styles.fileActionBtn}
                    onPress={() => onPreview(doc._id)}
                    disabled={busyDocId === doc._id}
                  >
                    {busyDocId === doc._id ? (
                      <ActivityIndicator color={colors.accent} size="small" />
                    ) : (
                      <Text style={styles.fileActionText}>Preview</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </Card>
            ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    marginTop: 20,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  fileName: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600', marginRight: 10 },
  fileActionBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  fileActionBtnDanger: { borderColor: colors.dangerBg },
  fileActionText: { color: colors.accent, fontWeight: '600', fontSize: 12 },
  fieldsHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.faint,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 10,
  },
  reqRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  reqName: { flex: 1, color: colors.text, fontWeight: '600', fontSize: 14 },
  exceptionBlock: {
    marginTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  exceptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exceptionTitle: { fontWeight: '700', fontSize: 14, color: colors.text },
  exceptionMsg: { color: colors.muted, fontSize: 12, marginTop: 6, lineHeight: 17 },
  issueRow: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    marginTop: 10,
  },
  issueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  issueField: { fontWeight: '700', fontSize: 13, color: colors.text },
  issueExplain: { color: colors.muted, fontSize: 12, marginTop: 3, lineHeight: 17 },
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
