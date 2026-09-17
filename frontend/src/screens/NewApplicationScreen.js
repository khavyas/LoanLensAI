import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { api } from '../api/client';
import { colors, labelize } from '../theme';
import { Card, Overline } from '../components/ui';

const PRODUCTS = ['auto-loan', 'personal-loan', 'small-business-loan'];

function Field({ label, ...inputProps }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={colors.faint} {...inputProps} />
    </View>
  );
}

export default function NewApplicationScreen({ navigation }) {
  const [productType, setProductType] = useState('auto-loan');
  const [requestedAmount, setRequestedAmount] = useState('');
  const [address, setAddress] = useState('');
  const [ssnLast4, setSsnLast4] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  // auto-loan / personal-loan
  const [employerName, setEmployerName] = useState('');
  const [statedMonthlyIncome, setStatedMonthlyIncome] = useState('');
  // small-business-loan
  const [businessName, setBusinessName] = useState('');
  const [statedAnnualBusinessRevenue, setStatedAnnualBusinessRevenue] = useState('');

  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const isSmallBusiness = productType === 'small-business-loan';

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      const payload = {
        productType,
        requestedAmount: Number(requestedAmount),
        address,
        ssnLast4,
        dateOfBirth,
        consentAccepted,
        ...(isSmallBusiness
          ? { businessName, statedAnnualBusinessRevenue: Number(statedAnnualBusinessRevenue) }
          : { employerName, statedMonthlyIncome: Number(statedMonthlyIncome) }),
      };
      const app = await api.createApplication(payload);
      navigation.replace('ApplicationDetail', { id: app._id });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 20 }}>
      <Card>
        <Overline>Loan product</Overline>
        <View style={styles.productRow}>
          {PRODUCTS.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.productBtn, productType === p && styles.productBtnActive]}
              onPress={() => setProductType(p)}
            >
              <Text style={[styles.productBtnText, productType === p && styles.productBtnTextActive]}>
                {labelize(p)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Overline>Application details</Overline>
        <View style={{ marginTop: 12 }}>
          {isSmallBusiness ? (
            <>
              <Field
                label="Legal / DBA business name"
                placeholder="Whitfield & Co. Bakery LLC"
                value={businessName}
                onChangeText={setBusinessName}
              />
              <Field
                label="Stated annual business revenue ($)"
                placeholder="340000"
                keyboardType="numeric"
                value={statedAnnualBusinessRevenue}
                onChangeText={setStatedAnnualBusinessRevenue}
              />
            </>
          ) : (
            <>
              <Field
                label="Employer name"
                placeholder="Brightline Logistics"
                value={employerName}
                onChangeText={setEmployerName}
              />
              <Field
                label="Stated gross monthly income ($)"
                placeholder="5000"
                keyboardType="numeric"
                value={statedMonthlyIncome}
                onChangeText={setStatedMonthlyIncome}
              />
            </>
          )}

          <Field
            label="Requested amount ($)"
            placeholder="28000"
            keyboardType="numeric"
            value={requestedAmount}
            onChangeText={setRequestedAmount}
          />
          <Field
            label="Address"
            placeholder="412 Maple Court, Springfield"
            value={address}
            onChangeText={setAddress}
          />
          <Field
            label="SSN (last 4)"
            placeholder="4821"
            keyboardType="numeric"
            maxLength={4}
            value={ssnLast4}
            onChangeText={setSsnLast4}
          />
          <Field
            label="Date of birth (must be 18 or older)"
            placeholder="YYYY-MM-DD"
            value={dateOfBirth}
            onChangeText={setDateOfBirth}
          />
        </View>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Overline>Disclosures &amp; consent</Overline>
        <TouchableOpacity
          style={styles.consentRow}
          onPress={() => setConsentAccepted((c) => !c)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, consentAccepted && styles.checkboxChecked]}>
            {consentAccepted && <Text style={styles.checkboxTick}>✓</Text>}
          </View>
          <Text style={styles.consentText}>
            I authorize First Community Bank to verify my identity and obtain a copy of my credit
            report, and I agree to receive account disclosures and communications electronically
            (E-Sign consent).
          </Text>
        </TouchableOpacity>
      </Card>

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.submitBtn, !consentAccepted && styles.submitBtnDisabled]}
        onPress={onSubmit}
        disabled={busy || !consentAccepted}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Submit application</Text>}
      </TouchableOpacity>
      <Text style={styles.hint}>
        After submitting, you'll land on your application's Documents tab, where you can upload
        exactly what's still required.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  productRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  productBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  productBtnActive: { borderColor: colors.accent, backgroundColor: colors.infoBg },
  productBtnText: { color: colors.muted, fontWeight: '600', fontSize: 12, textAlign: 'center' },
  productBtnTextActive: { color: colors.accent },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: '#FCFDFE',
  },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 10, gap: 12 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkboxTick: { color: '#fff', fontSize: 13, fontWeight: '800' },
  consentText: { flex: 1, color: colors.muted, fontSize: 13, lineHeight: 19 },
  submitBtn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  submitBtnDisabled: { backgroundColor: colors.faint },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  error: { color: colors.danger, marginTop: 16, fontSize: 13, textAlign: 'center' },
  hint: { color: colors.faint, fontSize: 12, textAlign: 'center', marginTop: 12, lineHeight: 17 },
});
