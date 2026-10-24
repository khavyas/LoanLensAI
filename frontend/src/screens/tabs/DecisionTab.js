import { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { colors, labelize } from '../../theme';
import { goToApplicationTab } from '../../navigationRef';
import { Pill, Card, Overline } from '../../components/ui';

const PARAM_TONE = { met: 'success', unmet: 'danger', pending: 'warning' };
const PARAM_LABEL = { met: 'Met', unmet: 'Not met', pending: 'Needs entry' };
const PARAM_ICON = { met: '✓', unmet: '✕', pending: '!' };
const PARAM_ACCENT = { met: colors.success, unmet: colors.danger, pending: colors.warning };

const CHECK_TONE = { verified: 'success', clear: 'success', scored: 'success', failed: 'danger', 'potential-match': 'danger', frozen: 'warning', 'thin-file': 'warning', 'not-run': 'neutral' };
const CHECK_LABEL = { verified: 'Verified', clear: 'Clear', scored: 'Score returned', failed: 'Failed', 'potential-match': 'Possible match', frozen: 'Frozen', 'thin-file': 'No history', 'not-run': 'Skipped' };

// Approve is green and Decline is red, always — tinted until chosen, solid once chosen.
const MODE_TONE = {
  approve: { fg: colors.success, tint: colors.successBg },
  reject: { fg: colors.danger, tint: colors.dangerBg },
};

const ACTION_LABEL = {
  'verification-run': 'Identity and credit checks run (simulated)',
  submitted: 'Application submitted',
  'credit-score-entered': 'Credit score entered',
  approve: 'Approved',
  reject: 'Declined',
  refer: 'Referred to underwriter',
  return: 'Returned to loan officer',
};

const MODES = {
  officer: [
    { key: 'approve', label: 'Approve' },
    { key: 'refer', label: 'Refer to underwriter' },
    { key: 'reject', label: 'Decline' },
  ],
  underwriter: [
    { key: 'approve', label: 'Approve' },
    { key: 'reject', label: 'Decline' },
    { key: 'return', label: 'Return to officer' },
  ],
};

const when = (d) => (d ? new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '');

function Field({ label, hint, value, onChangeText, multiline = true, placeholder }) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      <TextInput
        style={[styles.input, multiline && styles.inputMulti]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
      />
    </View>
  );
}

// Staff-only page: does this file meet the bank's parameters, who has touched
// it, and what each role may do next. All rules are enforced on the server
// (services/decisionRules.js) — the buttons here only mirror them.
export default function DecisionTab({ app, onChanged }) {
  const { user } = useAuth();
  const role = user.role;
  const assessment = app.assessment;
  const modes = MODES[role] || [];
  const final = app.status === 'approved' || app.status === 'rejected';

  const [mode, setMode] = useState(null);
  const [note, setNote] = useState('');
  const [relationship, setRelationship] = useState('');
  const [compensating, setCompensating] = useState('');
  const [conditions, setConditions] = useState('');
  const [score, setScore] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const canAct =
    !final &&
    ((role === 'officer' && ['submitted', 'needs-review'].includes(app.status)) ||
      (role === 'underwriter' && app.status === 'referred'));
  const unmet = (assessment?.parameters || []).filter((p) => p.status === 'unmet');

  const allowed = {
    approve: role === 'underwriter' ? !assessment.blockers.length : assessment.canApprove,
    refer: assessment?.canRefer,
    reject: true,
    return: true,
  };

  async function run(call) {
    setError(null);
    setBusy(true);
    try {
      await call();
      setMode(null);
      setNote('');
      setRelationship('');
      setCompensating('');
      setConditions('');
      setScore('');
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const saveScore = () => run(() => api.setCreditScore(app._id, score));
  const runChecks = () => run(() => api.runChecks(app._id));
  const report = app.verificationReport;
  const checkRows = report
    ? [
        { title: 'Identity (SSN, name, date of birth)', ...report.identity },
        { title: 'Sanctions screening', ...report.sanctions },
        { title: 'Credit report', ...report.credit },
      ]
    : [];

  const submit = () =>
    run(() =>
      api.decide(app._id, {
        action: mode,
        note,
        ...(mode === 'refer' ? { relationshipNote: relationship } : {}),
        ...(role === 'underwriter' && mode === 'approve'
          ? {
              waivedParameters: unmet.map((p) => p.key),
              compensatingFactors: compensating,
              relationshipNote: relationship,
              conditions,
            }
          : {}),
      })
    );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, maxWidth: 820 }}>
      <Card style={{ marginBottom: 12 }}>
        <View style={styles.simHead}>
          <Overline>Identity and credit checks</Overline>
          <Pill tone="info">Simulated</Pill>
        </View>
        {!report ? (
          <Text style={styles.help}>
            Not run yet. These checks use scripted test data — in production a licensed bureau and identity
            network answer here. Run them to verify who the borrower is and pull a credit score.
          </Text>
        ) : (
          <>
            {checkRows.map((r) => (
              <View key={r.title} style={[styles.paramRow, { borderLeftColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <View style={styles.paramTop}>
                    <Text style={styles.paramLabel}>{r.title}</Text>
                    <Pill tone={CHECK_TONE[r.status]}>{CHECK_LABEL[r.status]}</Pill>
                  </View>
                  <Text style={styles.paramDetail}>{r.detail}</Text>
                </View>
              </View>
            ))}
            <Text style={styles.simMeta}>
              {report.provider} · run {when(report.runAt)}
              {report.scenario ? ` · test scenario: ${report.scenario}` : ''}
            </Text>
          </>
        )}
        {canAct && (
          <TouchableOpacity style={[styles.secondaryBtn, { alignSelf: 'flex-start', marginTop: 12 }]} onPress={runChecks} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.accent} /> : (
              <Text style={styles.secondaryText}>{report ? 'Run again' : 'Run identity and credit checks'}</Text>
            )}
          </TouchableOpacity>
        )}
      </Card>

      <Card>
        <Overline>Does this file meet the bank's parameters?</Overline>
        {(assessment?.parameters || []).map((p) => (
          <View key={p.key} style={[styles.paramRow, { borderLeftColor: PARAM_ACCENT[p.status] }]}>
            <View style={[styles.icon, { backgroundColor: PARAM_ACCENT[p.status] }]}>
              <Text style={styles.iconText}>{PARAM_ICON[p.status]}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.paramTop}>
                <Text style={styles.paramLabel}>
                  {p.label}
                  {p.waivable ? <Text style={styles.waivable}>  · underwriter can waive</Text> : null}
                </Text>
                <Pill tone={PARAM_TONE[p.status]}>{PARAM_LABEL[p.status]}</Pill>
              </View>
              <Text style={styles.paramDetail}>{p.detail}</Text>
            </View>
          </View>
        ))}
      </Card>

      {(assessment?.duplicates || []).length > 0 && (
        <Card style={{ marginTop: 12, borderColor: colors.danger, borderWidth: 1 }}>
          <Overline>Matching earlier applications</Overline>
          <Text style={styles.help}>
            These share this applicant's SSN last-4 and date of birth. The earlier record is not affected.
          </Text>
          {assessment.duplicates.map((d) => (
            <View key={d.id} style={styles.dupRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.paramLabel}>{d.applicantName}</Text>
                <Text style={styles.paramDetail}>
                  {d.kind === 'different-name' ? 'Different name — possible identity reuse' : 'Same person — another open application'} · {labelize(d.status)}
                </Text>
              </View>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => goToApplicationTab(d.id, 'decision')}>
                <Text style={styles.secondaryText}>Open</Text>
              </TouchableOpacity>
            </View>
          ))}
        </Card>
      )}

      {canAct && (
        <Card style={{ marginTop: 12 }}>
          <Overline>Credit score (manual entry)</Overline>
          <Text style={styles.help}>
            {app.creditProfile?.score != null
              ? `Recorded: ${app.creditProfile.score}${app.creditProfile.source === 'simulated' ? ' (from the simulated bureau)' : app.creditProfile.enteredBy ? ` (entered by ${app.creditProfile.enteredBy})` : ''}.`
              : 'No score yet. Run the credit check above, or type one in here — for example after reviewing a thin-file borrower by other means.'}
          </Text>
          <View style={styles.scoreRow}>
            <TextInput
              style={[styles.input, { width: 120 }]}
              value={score}
              onChangeText={setScore}
              keyboardType="number-pad"
              placeholder="300–850"
              placeholderTextColor={colors.faint}
            />
            <TouchableOpacity style={styles.secondaryBtn} onPress={saveScore} disabled={busy || !score}>
              <Text style={styles.secondaryText}>{app.creditProfile?.score != null ? 'Update score' : 'Save score'}</Text>
            </TouchableOpacity>
          </View>
        </Card>
      )}

      {final ? (
        <Card style={{ marginTop: 12 }}>
          <Overline>Decision recorded</Overline>
          <View style={styles.finalHead}>
            <Pill tone={app.status === 'approved' ? 'success' : 'danger'}>{labelize(app.status)}</Pill>
            <Text style={styles.help}>
              by {app.decision?.decidedBy?.name} ({app.decision?.decidedBy?.role}) · {when(app.decision?.decidedAt)}
            </Text>
          </View>
          {app.decision?.reason ? <Text style={styles.body}>{app.decision.reason}</Text> : null}
          {app.decision?.exception ? (
            <View style={styles.exceptionBox}>
              <Text style={styles.exceptionTitle}>Approved as an exception</Text>
              <Text style={styles.body}>
                Waived: {app.decision.exception.waivedParameters.map((k) => labelize(k)).join(', ')}
              </Text>
              <Text style={styles.body}>Compensating factors: {app.decision.exception.compensatingFactors}</Text>
              {app.decision.exception.relationshipNote ? (
                <Text style={styles.body}>Relationship note: {app.decision.exception.relationshipNote}</Text>
              ) : null}
            </View>
          ) : null}
          {app.decision?.conditions?.length ? (
            <Text style={styles.body}>Conditions: {app.decision.conditions.join('; ')}</Text>
          ) : null}
        </Card>
      ) : canAct ? (
        <Card style={{ marginTop: 12 }}>
          <Overline>{role === 'underwriter' ? 'Underwriter decision' : 'Loan officer decision'}</Overline>

          {role === 'officer' && !assessment.canApprove && (
            <Text style={styles.notice}>
              {assessment.canRefer
                ? 'Some parameters are not met, so you cannot approve this yourself. Refer it to the underwriter for an exception, or decline it.'
                : assessment.blockers.length
                  ? `Resolve these first: ${assessment.blockers.map((b) => b.label).join(', ')}.`
                  : ''}
            </Text>
          )}
          {role === 'underwriter' && assessment.blockers.length > 0 && (
            <Text style={styles.notice}>
              These cannot be waived, so you cannot approve yet: {assessment.blockers.map((b) => b.label).join(', ')}.
              Return the file to the loan officer or decline it.
            </Text>
          )}

          <View style={styles.modeRow}>
            {modes.map((m) => {
              const disabled = !allowed[m.key];
              const tone = MODE_TONE[m.key];
              const selected = mode === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  style={[
                    styles.modeBtn,
                    selected && styles.modeBtnActive,
                    tone && { borderColor: tone.fg, backgroundColor: selected ? tone.fg : tone.tint },
                    disabled && { opacity: 0.4 },
                  ]}
                  onPress={() => setMode(m.key)}
                  disabled={disabled}
                >
                  <Text
                    style={[
                      styles.modeText,
                      selected && styles.modeTextActive,
                      tone && { color: selected ? '#fff' : tone.fg, fontWeight: '700' },
                    ]}
                  >
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {mode === 'approve' && role === 'officer' && (
            <Field label="Note (optional)" value={note} onChangeText={setNote} />
          )}
          {mode === 'refer' && (
            <>
              <Field
                label="Why does this borrower deserve an exception?"
                hint="Required. This is what the underwriter reads first."
                value={note}
                onChangeText={setNote}
              />
              <Field
                label="Who knows this borrower, and how? (optional)"
                hint="For example: a branch relationship, an employer reference, years as a customer."
                value={relationship}
                onChangeText={setRelationship}
              />
            </>
          )}
          {mode === 'approve' && role === 'underwriter' && (
            <>
              {unmet.length > 0 && (
                <Text style={styles.waiveBox}>
                  You are waiving: {unmet.map((p) => p.label).join(', ')}.
                </Text>
              )}
              <Field
                label="Compensating factors"
                hint="Required for an exception: what makes this borrower a sound risk despite the shortfall."
                value={compensating}
                onChangeText={setCompensating}
              />
              <Field
                label="Who knows this borrower, and how? (optional)"
                value={relationship}
                onChangeText={setRelationship}
              />
              <Field
                label="Conditions of approval (one per line, optional)"
                value={conditions}
                onChangeText={setConditions}
              />
            </>
          )}
          {mode === 'reject' && (
            <Field
              label="Reason for declining"
              hint="The borrower is told these specific reasons."
              value={note}
              onChangeText={setNote}
            />
          )}
          {mode === 'return' && (
            <Field label="What do you need from the loan officer?" value={note} onChangeText={setNote} />
          )}

          {mode && (
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                mode === 'reject' && { backgroundColor: colors.danger },
                mode === 'approve' && { backgroundColor: colors.success },
              ]}
              onPress={submit}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>
                  Confirm: {modes.find((m) => m.key === mode)?.label}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </Card>
      ) : (
        <Card style={{ marginTop: 12 }}>
          <Overline>Decision</Overline>
          <Text style={styles.help}>
            {role === 'officer' && app.status === 'referred'
              ? 'This file is with the underwriter. You will see their decision here.'
              : role === 'underwriter'
                ? 'This application has not been referred to you. Referred files appear in your list with the status "With Underwriter".'
                : 'No action is available right now.'}
          </Text>
        </Card>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      <Card style={{ marginTop: 12 }}>
        <Overline>Review history</Overline>
        {(app.reviewHistory || []).length === 0 && <Text style={styles.help}>No review activity yet.</Text>}
        {(app.reviewHistory || [])
          .slice()
          .reverse()
          .map((e, i) => (
            <View key={i} style={styles.event}>
              <Text style={styles.eventTitle}>
                {ACTION_LABEL[e.action] || labelize(e.action)}
                <Text style={styles.eventMeta}>
                  {'  '}· {e.actor?.name} ({e.actor?.role}) · {when(e.at)}
                </Text>
              </Text>
              {e.note ? <Text style={styles.body}>{e.note}</Text> : null}
              {e.details?.score != null ? <Text style={styles.body}>Score {e.details.score}</Text> : null}
              {e.details?.unmetParameters?.length ? (
                <Text style={styles.body}>Unmet: {e.details.unmetParameters.map((k) => labelize(k)).join(', ')}</Text>
              ) : null}
              {e.details?.relationshipNote ? (
                <Text style={styles.body}>Relationship: {e.details.relationshipNote}</Text>
              ) : null}
              {e.details?.waivedParameters?.length ? (
                <Text style={styles.body}>Waived: {e.details.waivedParameters.map((k) => labelize(k)).join(', ')}</Text>
              ) : null}
            </View>
          ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  dupRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: colors.border },
  simHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  simMeta: { color: colors.faint, fontSize: 11, marginTop: 12, lineHeight: 16 },
  paramRow: { flexDirection: 'row', gap: 10, borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 6, marginTop: 10, alignItems: 'flex-start' },
  icon: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  iconText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  paramTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  paramLabel: { flexShrink: 1, fontWeight: '700', fontSize: 13, color: colors.text },
  waivable: { fontWeight: '600', fontSize: 11, color: colors.info },
  paramDetail: { color: colors.muted, fontSize: 12, marginTop: 3, lineHeight: 17 },
  help: { color: colors.muted, fontSize: 13, marginTop: 6, lineHeight: 19 },
  body: { color: colors.text, fontSize: 13, marginTop: 6, lineHeight: 19 },
  notice: { color: colors.warning, backgroundColor: colors.warningBg, borderRadius: 8, padding: 10, fontSize: 13, marginTop: 10, lineHeight: 19 },
  waiveBox: { color: colors.info, backgroundColor: colors.infoBg, borderRadius: 8, padding: 10, fontSize: 13, marginTop: 12, lineHeight: 19 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  modeBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: colors.card },
  modeBtnActive: { borderColor: colors.accent, backgroundColor: colors.infoBg },
  modeText: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  modeTextActive: { color: colors.accent },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.text },
  fieldHint: { fontSize: 11, color: colors.faint, marginTop: 2 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: colors.text, backgroundColor: '#FCFDFE', marginTop: 6 },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  primaryBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  secondaryBtn: { borderWidth: 1, borderColor: colors.accent, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 14 },
  secondaryText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  error: { color: colors.danger, marginTop: 10, fontSize: 13 },
  finalHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  exceptionBox: { backgroundColor: colors.infoBg, borderRadius: 8, padding: 12, marginTop: 10 },
  exceptionTitle: { fontWeight: '800', color: colors.info, fontSize: 13 },
  event: { marginTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderColor: colors.border },
  eventTitle: { fontWeight: '700', fontSize: 13, color: colors.text },
  eventMeta: { fontWeight: '500', fontSize: 11, color: colors.faint },
});
