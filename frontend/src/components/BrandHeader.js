import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, labelize } from '../theme';
import { useAuth } from '../context/AuthContext';

function initials(name) {
  return (name || '')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// The global header for every authenticated screen — set once as the
// Stack Navigator's header (App.js), not per-screen, so branding/nav/profile
// can never be accidentally missing from a screen the way the plain
// "Application" / "Apply for a Loan" titles were before.
export default function BrandHeader({ navigation, options, back }) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <View style={styles.bar}>
      <View style={styles.left}>
        {back && (
          <TouchableOpacity
            onPress={navigation.goBack}
            style={styles.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.brand}
          onPress={() => navigation.navigate('Applications')}
        >
          <View style={styles.logoMark}>
            <Text style={styles.logoMarkText}>L</Text>
          </View>
          <Text style={styles.brandText}>
            LoanLens <Text style={{ color: colors.accent }}>AI</Text>
          </Text>
        </TouchableOpacity>
        {options?.title && <Text style={styles.pageTitle}>{options.title}</Text>}
      </View>

      {user && (
        <View style={styles.right}>
          <TouchableOpacity
            style={styles.avatar}
            onPress={() => setMenuOpen((v) => !v)}
          >
            <Text style={styles.avatarText}>{initials(user.name)}</Text>
          </TouchableOpacity>
          {menuOpen && (
            <View style={styles.menu}>
              <Text style={styles.menuName}>{user.name}</Text>
              <Text style={styles.menuRole}>{labelize(user.role)} · {user.email}</Text>
              <View style={styles.menuDivider} />
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => setMenuOpen(false)}
              >
                <Text style={styles.menuItemText}>⚙ Account settings</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  logout();
                }}
              >
                <Text style={[styles.menuItemText, { color: colors.danger }]}>Sign out</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 56,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { padding: 4 },
  backArrow: { color: '#fff', fontSize: 20, fontWeight: '700' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoMark: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMarkText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  brandText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  pageTitle: { color: 'rgba(255,255,255,0.55)', fontSize: 14, marginLeft: 4 },
  right: { position: 'relative' },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  menu: {
    position: 'absolute',
    top: 44,
    right: 0,
    minWidth: 220,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    zIndex: 999,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  menuName: { fontWeight: '700', fontSize: 14, color: colors.text, paddingHorizontal: 14 },
  menuRole: { color: colors.muted, fontSize: 12, marginTop: 2, paddingHorizontal: 14 },
  menuDivider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
  menuItem: { paddingHorizontal: 14, paddingVertical: 8 },
  menuItemText: { fontSize: 13, fontWeight: '600', color: colors.text },
});
