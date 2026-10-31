import { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { api } from '../api/client';
import { colors } from '../theme';
import { Card, Overline } from './ui';

// The borrower correcting a mistake on their own application. Which fields can be edited,
// and the term options, come from the server (app.edit) so the rules live in one place.
const FIELDS = {
  requestedAmount: { label: 'Requested amount ($)', numeric: true },
  statedMonthlyIncome: { label: 'Stated gross monthly income ($)', numeric: true },
  statedAnnualBusinessRevenue: { label: 'Stated annual business revenue ($)', numeric: true },
  repaymentTermMonths: { label: 'Repayment term', term: true },
  businessName: { label: 'Legal / DBA business name' },
  employerName: { label: 'Employer name' },
  employerPhone: { label: 'Employer phone' },
  loanReason: { label: 'Reason for loan' },
  address: { label: 'Address' },
};

export default function EditApplicationPanel({ app, onSaved, onCancel }) {
  // Natural order (amount, income, term, employer ...), not the order the server happens to list them.
  const order = Object.keys(FIELDS);
  const fields = (app.edit?.fields || []).filter((f) => FIELDS[f]).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f, app[f] == null ? '' : String(app[f])])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setError(null);
    // Send only what the borrower actually changed.
    const changes = {};
    for (const f of fields) {
      const now = String(values[f] ?? '').trim();
      const before = app[f] == null ? '' : String(app[f]);
      if (now !== before) changes[f] = FIELDS[f].numeric || FIELDS[f].term ? Number(now) : now;
    }
    if (!Object.keys(changes).length) {
      setError("You haven't changed anything yet.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.updateApplication(app._id, changes);
      onSaved(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, maxWidth: 760 }}>
      <Card>
        <Overline>Edit your application</Overline>
        <Text style={styles.intro}>
          Fix a mistake and we will re-check your documents straight away. Your name, date of birth, SSN digits and
          residency cannot be changed here. Contact your loan officer for those.
        </Text>

        {fields.map((f) => (
          <View key={f} style={{ marginTop: 18 }}>
            <Text style={styles.label}>{FIELDS[f].label}</Text>
            {FIELDS[f].term ? (
              <View style={styles.termRow}>
                {(app.edit?.termOptions || []).map((m) => {
                  const on = Number(values[f]) === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[styles.termBtn, on && styles.termBtnOn]}
                      onPress={() => setValues((v) => ({ ...v, [f]: String(m) }))}
                    >
                      <Text style={[styles.termText, on && styles.termTextOn]}>{m} mo</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <TextInput
                style={styles.input}
                value={values[f]}
                onChangeText={(t) => setValues((v) => ({ ...v, [f]: t }))}
                keyboardType={FIELDS[f].numeric ? 'numeric' : 'default'}
              />
            )}
          </View>
        ))}

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.cancel} onPress={onCancel} disabled={busy}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.save} onPress={save} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save changes</Text>}
          </TouchableOpacity>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  intro: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8 },
  label: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: '#667085',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    color: '#000',
    backgroundColor: '#fff',
  },
  termRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  termBtn: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 18, backgroundColor: colors.card },
  termBtnOn: { borderColor: colors.accent, backgroundColor: colors.infoBg },
  termText: { fontSize: 16, fontWeight: '600', color: colors.muted },
  termTextOn: { color: colors.accent, fontWeight: '800' },
  error: { color: colors.danger, fontSize: 15, fontWeight: '600', marginTop: 16, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancel: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 8, paddingVertical: 14, paddingHorizontal: 22, backgroundColor: colors.card },
  cancelText: { fontSize: 16, fontWeight: '700', color: colors.text },
  save: { flex: 1, backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
