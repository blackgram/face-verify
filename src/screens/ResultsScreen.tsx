import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { livenessStart, ApiError, type LivenessVerifyResponse } from '../api/liveness';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Results'>;

type Outcome = LivenessVerifyResponse['overall_result'];

const OUTCOME_CONFIG: Record<Outcome, { icon: string; title: string; color: string; canRetry: boolean }> = {
  pass: { icon: '✓', title: 'Verification Successful', color: colors.success, canRetry: false },
  fail: { icon: '✕', title: 'Verification Failed', color: colors.error, canRetry: true },
  spoof_detected: { icon: '🚫', title: 'Could Not Verify Identity', color: colors.error, canRetry: false },
  retry: { icon: '↻', title: 'Please Try Again', color: colors.warning, canRetry: true },
  step_up: { icon: '⚠️', title: 'Additional Verification Needed', color: colors.warning, canRetry: false },
};

export default function ResultsScreen({ navigation, route }: Props) {
  const { bvn, accountNo, result } = route.params;
  const outcome = result.overall_result;
  const cfg = OUTCOME_CONFIG[outcome] ?? OUTCOME_CONFIG.fail;

  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const handleTryAgain = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      const data = await livenessStart(bvn, accountNo);
      navigation.replace('Instructions', {
        bvn,
        accountNo,
        sessionId: data.session_id,
        customerId: data.customer_id,
        nonce: data.nonce,
        prompts: data.prompts,
        expiresAt: data.expires_at,
      });
    } catch (e) {
      if (e instanceof ApiError) {
        setRetryError(e.message);
      } else {
        setRetryError(e instanceof Error ? e.message : 'Could not start new session.');
      }
      setRetrying(false);
    }
  };

  const handleStartOver = () => navigation.popToTop();

  const isPass = outcome === 'pass';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        {/* Result icon */}
        <View style={[styles.iconCircle, { borderColor: cfg.color }]}>
          <Text style={[styles.iconText, { color: cfg.color }]}>{cfg.icon}</Text>
        </View>

        <Text style={styles.title}>{cfg.title}</Text>
        <Text style={styles.message}>{result.message}</Text>

        {/* Scores card */}
        {isPass && (
          <View style={styles.scoresCard}>
            <ScoreRow
              label="Liveness"
              value={result.liveness_check.is_real ? 'Real' : 'Not Real'}
              confidence={result.liveness_check.confidence}
              ok={result.liveness_check.is_real}
            />
            <View style={styles.divider} />
            <ScoreRow
              label="Face Match"
              value={result.face_verification.verified ? 'Verified' : 'Not Verified'}
              confidence={result.face_verification.confidence}
              ok={result.face_verification.verified}
            />
          </View>
        )}

        {/* Risk flags */}
        {result.risk_flags.length > 0 && (
          <View style={styles.flagsCard}>
            <Text style={styles.flagsTitle}>Risk Flags</Text>
            {result.risk_flags.map((flag, i) => (
              <Text key={i} style={styles.flagItem}>• {flag}</Text>
            ))}
          </View>
        )}

        {retryError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{retryError}</Text>
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        {cfg.canRetry && (
          <Pressable
            style={[styles.primaryBtn, retrying && styles.btnDisabled]}
            onPress={handleTryAgain}
            disabled={retrying}
          >
            {retrying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Try Again</Text>
            )}
          </Pressable>
        )}
        <Pressable style={isPass ? styles.primaryBtn : styles.secondaryBtn} onPress={handleStartOver}>
          <Text style={isPass ? styles.primaryBtnText : styles.secondaryBtnText}>
            {isPass ? 'Done' : 'Start Over'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function ScoreRow({
  label,
  value,
  confidence,
  ok,
}: {
  label: string;
  value: string;
  confidence: number;
  ok: boolean;
}) {
  return (
    <View style={styles.scoreRow}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <View style={styles.scoreRight}>
        <Text style={[styles.scoreValue, { color: ok ? colors.success : colors.error }]}>
          {value}
        </Text>
        <Text style={styles.scoreConf}>{(confidence * 100).toFixed(1)}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.xxl },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  iconText: { fontSize: 40, fontWeight: '800' },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  message: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.xl },
  scoresCard: {
    width: '100%',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  divider: { height: 1, backgroundColor: colors.cardBorder, marginVertical: spacing.sm },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  scoreLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  scoreRight: { alignItems: 'flex-end' },
  scoreValue: { fontSize: 15, fontWeight: '600' },
  scoreConf: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  flagsCard: {
    width: '100%',
    backgroundColor: colors.warningMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  flagsTitle: { fontSize: 14, fontWeight: '600', color: colors.warning, marginBottom: spacing.xs },
  flagItem: { fontSize: 13, color: colors.text, lineHeight: 20 },
  errorBanner: {
    width: '100%',
    backgroundColor: colors.errorMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { fontSize: 14, color: colors.error },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  btnDisabled: { backgroundColor: colors.disabled },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  secondaryBtnText: { color: colors.text, fontSize: 16, fontWeight: '600' },
});
