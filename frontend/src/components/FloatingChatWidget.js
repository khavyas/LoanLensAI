import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { api } from '../api/client';
import AssistantTab from '../screens/tabs/AssistantTab';
import { colors, shadow } from '../theme';

// Wide screens (`dockable`): the open chat is a full-height column at the
// right edge of the layout row (App.js), so the content beside it narrows
// rather than being covered. Narrow screens: it floats over the content.
export default function FloatingChatWidget({
  user,
  activeApplicationId,
  dockable = false,
  dockWidth = 400,
  onOpenChange,
}) {
  const { width, height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applications, setApplications] = useState([]);
  const [error, setError] = useState('');

  function toggleOpen(nextOpen) {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  function minimizeChat() {
    setMinimized(true);
    onOpenChange?.(false);
  }

  useEffect(() => {
    if (!open || !user) return undefined;
    let active = true;
    setLoading(true);
    setError('');
    api.applications()
      .then((items) => { if (active) setApplications(items); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, user?.email]);

  if (!user) return null;

  const app = applications.find((item) => item._id === activeApplicationId) || applications[0];
  const panelVisible = open && !minimized;
  const docked = dockable && panelVisible;
  const panelStyle = docked
    ? styles.dockedPanel
    : [
        styles.panel,
        {
          width: Math.min(420, Math.max(280, width - 32)),
          height: Math.min(620, Math.max(360, height - 96)),
        },
      ];

  // The same root View is used in both modes (only its style changes), so
  // docking/undocking on resize never remounts the conversation.
  return (
    <View
      pointerEvents="box-none"
      style={docked ? [styles.dock, { width: dockWidth }] : styles.anchor}
    >
      {open && (
        <View style={[panelStyle, minimized && styles.hiddenPanel]}>
          <View style={styles.header}>
            <View style={styles.headerTitle}>
              <Text style={styles.title}>LoanLens Assistant</Text>
              <Text style={styles.subtitle}>Questions about loans, policies, and your application</Text>
            </View>
            <TouchableOpacity
              style={styles.minimizeButton}
              onPress={minimizeChat}
              accessibilityRole="button"
              accessibilityLabel="Minimize chat"
            >
              <Text style={styles.minimizeText}>{'\u2212'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => { setMinimized(false); toggleOpen(false); }}
              accessibilityRole="button"
              accessibilityLabel="Close chat"
            >
              <Text style={styles.closeText}>×</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.body}>
            {loading ? (
              <ActivityIndicator style={styles.loading} color={colors.accent} />
            ) : error ? (
              <Text style={styles.message}>{error}</Text>
            ) : app ? (
              <AssistantTab app={app} />
            ) : (
              <Text style={styles.message}>A loan application is needed before I can answer application questions.</Text>
            )}
          </View>
        </View>
      )}
      {(!open || minimized) && (
        <TouchableOpacity
          style={styles.launcher}
          onPress={() => {
            if (minimized) {
              setMinimized(false);
              onOpenChange?.(true);
            } else {
              toggleOpen(true);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Open LoanLens chat"
        >
          <Text style={styles.launcherIcon}>💬</Text>
          <Text style={styles.launcherText}>Ask LoanLens</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', right: 20, bottom: 20, zIndex: 1000, elevation: 30 },
  dock: { alignSelf: 'stretch', flexShrink: 0 },
  dockedPanel: {
    flex: 1,
    backgroundColor: colors.card,
    borderLeftWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  launcher: {
    minHeight: 54,
    borderRadius: 28,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    ...shadow,
  },
  launcherIcon: { fontSize: 20 },
  launcherText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  panel: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    ...shadow,
  },
  hiddenPanel: { display: 'none' },
  header: {
    minHeight: 66,
    paddingLeft: 16,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  headerTitle: { flex: 1, marginRight: 8 },
  subtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  closeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  minimizeButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  minimizeText: { color: colors.primary, fontSize: 26, lineHeight: 30, fontWeight: '700' },
  closeText: { color: colors.muted, fontSize: 28, lineHeight: 30 },
  body: { flex: 1, minHeight: 0, backgroundColor: colors.bg },
  loading: { marginTop: 36 },
  message: { color: colors.muted, padding: 20, fontSize: 14, lineHeight: 21 },
});
