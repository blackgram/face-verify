import React, { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { livenessStart, ApiError } from '../api/liveness';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'BvnEntry'>;

export default function BvnEntryScreen({ navigation }: Props) {
  const [bvn, setBvn] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bvnValid = /^\d{11}$/.test(bvn);
  const accountValid = /^\d{10}$/.test(accountNo);
  const canSubmit = bvnValid && accountValid && !loading;

  const handleContinue = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const data = await livenessStart(bvn.trim(), accountNo.trim());
      navigation.navigate('Instructions', {
        bvn: bvn.trim(),
        accountNo: accountNo.trim(),
        sessionId: data.session_id,
        customerId: data.customer_id,
        nonce: data.nonce,
        prompts: data.prompts,
        expiresAt: data.expires_at,
      });
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>🔐</Text>
            </View>
            <Text style={styles.title}>Identity Verification</Text>
            <Text style={styles.subtitle}>
              Enter your BVN and account number to begin facial verification.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>BVN</Text>
              <TextInput
                style={[styles.input, bvn.length > 0 && !bvnValid && styles.inputError]}
                placeholder="11-digit BVN"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={11}
                value={bvn}
                onChangeText={(t) => {
                  setBvn(t.replace(/\D/g, ''));
                  setError(null);
                }}
                autoFocus
              />
              {bvn.length > 0 && !bvnValid && (
                <Text style={styles.fieldHint}>BVN must be exactly 11 digits</Text>
              )}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Account Number</Text>
              <TextInput
                style={[styles.input, accountNo.length > 0 && !accountValid && styles.inputError]}
                placeholder="10-digit account number"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={10}
                value={accountNo}
                onChangeText={(t) => {
                  setAccountNo(t.replace(/\D/g, ''));
                  setError(null);
                }}
              />
              {accountNo.length > 0 && !accountValid && (
                <Text style={styles.fieldHint}>Account number must be exactly 10 digits</Text>
              )}
            </View>
          </View>

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Pressable
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={handleContinue}
            disabled={!canSubmit}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.lg },
  header: { alignItems: 'center', marginTop: spacing.xxl },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  iconText: { fontSize: 32 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },
  form: { marginTop: spacing.xl },
  field: { marginBottom: spacing.lg },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
  },
  inputError: {
    borderColor: colors.error,
  },
  fieldHint: {
    fontSize: 12,
    color: colors.error,
    marginTop: spacing.xs,
  },
  errorBanner: {
    backgroundColor: colors.errorMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: { fontSize: 14, color: colors.error, lineHeight: 20 },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { backgroundColor: colors.disabled },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
