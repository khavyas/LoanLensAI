import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme';

// Whether the assistant has read this application's latest documents. The documents are indexed
// in the background after every upload, edit and decision, so right after a change the assistant
// may still be catching up; this removes the "why can't the assistant see my upload?" doubt.
export default function IndexStatus({ status, onRetry }) {
  if (!status) return null;
  if (status === 'indexing') {
    return <Text style={[styles.text, { color: colors.muted }]}>Assistant is reading the latest documents…</Text>;
  }
  if (status === 'failed') {
    return (
      <View style={styles.row}>
        <Text style={[styles.text, { color: colors.warning }]}>! The assistant could not read the latest documents.</Text>
        <TouchableOpacity onPress={onRetry} accessibilityLabel="Try again">
          <Text style={styles.retry}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
  // Up to date is the normal state, so it shows nothing. Only "reading" and "could not read" are worth a line.
  return null;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
  text: { fontSize: 13, fontWeight: '600' },
  retry: { color: colors.accent, fontSize: 13, fontWeight: '800' },
});
