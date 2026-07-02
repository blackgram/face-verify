import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Instructions'>;

const TIPS = [
  { icon: '💡', title: 'Well-lit environment', desc: 'Stay in a well-lit area — avoid backlighting or harsh shadows.' },
  { icon: '🕶️', title: 'Remove obstructions', desc: 'Take off glasses, face masks, hats, or any head coverings.' },
  { icon: '📱', title: 'Hold at eye level', desc: 'Hold your phone steady at eye level, about an arm\'s length away.' },
  { icon: '🎯', title: 'Follow the prompts', desc: 'You will be asked to look straight, turn, smile, blink, or nod.' },
];

export default function InstructionsScreen({ navigation, route }: Props) {
  const { bvn, accountNo, sessionId, customerId, nonce, prompts, expiresAt } = route.params;
  const expiresAtMs = new Date(expiresAt).getTime();

  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000)),
  );

  useEffect(() => {
    const id = setInterval(() => {
      const left = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAtMs]);

  const expired = secondsLeft <= 0;

  const handleReady = () => {
    if (expired) return;
    navigation.navigate('FaceCapture', {
      bvn,
      accountNo,
      sessionId,
      customerId,
      nonce,
      prompts,
      expiresAt,
    });
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Before you begin</Text>
            <Text style={styles.subtitle}>
              Please prepare for the face verification by following these tips.
            </Text>
          </View>

          {/* Tips */}
          <View style={styles.tipsCard}>
            {TIPS.map((tip, i) => (
              <View key={i} style={[styles.tipRow, i < TIPS.length - 1 && styles.tipBorder]}>
                <View style={styles.tipIcon}>
                  <Text style={styles.tipEmoji}>{tip.icon}</Text>
                </View>
                <View style={styles.tipText}>
                  <Text style={styles.tipTitle}>{tip.title}</Text>
                  <Text style={styles.tipDesc}>{tip.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Session timer */}
          <View style={[styles.timerBanner, expired && styles.timerBannerExpired]}>
            <Text style={[styles.timerText, expired && styles.timerTextExpired]}>
              {expired
                ? 'Session expired — go back to start a new one.'
                : `Session expires in ${formatTime(secondsLeft)}`}
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Pressable
            style={[styles.button, expired && styles.buttonDisabled]}
            onPress={handleReady}
            disabled={expired}
          >
            <Text style={styles.buttonText}>I'm Ready</Text>
          </Pressable>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.lg },
  header: { marginTop: spacing.xl },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  tipsCard: {
    marginTop: spacing.xl,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  tipRow: {
    flexDirection: 'row',
    padding: spacing.md,
    alignItems: 'flex-start',
  },
  tipBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  tipIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  tipEmoji: { fontSize: 20 },
  tipText: { flex: 1 },
  tipTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 2 },
  tipDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  timerBanner: {
    marginTop: spacing.lg,
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  timerBannerExpired: { backgroundColor: colors.errorMuted },
  timerText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  timerTextExpired: { color: colors.error },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  buttonDisabled: { backgroundColor: colors.disabled },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  backButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  backButtonText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
});
