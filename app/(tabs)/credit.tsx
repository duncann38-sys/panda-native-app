import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createElement, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { PandaLogo } from '@/components/PandaLogo';
import { useColors } from '@/hooks/useColors';

const creditAmount = 1000;
const flatRate = 0.12;
const flatCharge = creditAmount * flatRate;
const totalRepayment = creditAmount + flatCharge;
const cardholderName = 'DUNCAN NYANZI';
const PRIVACY_POLICY_URL = 'https://www.pandaindustry.co/legal/#privacy';
const PANDA_CREDIT_APPLICATION_URL = 'https://forms.gle/MqtdLzredyJ4SMYk6';
const paymentSchedule = [
  { label: 'Payment 1', timing: 'Next month', amount: '£373.33' },
  { label: 'Payment 2', timing: 'In 2 months', amount: '£373.33' },
  { label: 'Payment 3', timing: 'In 3 months', amount: '£373.34' },
];

export default function CreditScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const dashboardTopPadding = Platform.OS === 'web' ? 78 : insets.top + 16;
  const [privacyOpen, setPrivacyOpen] = useState(false);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingBottom: 120,
          paddingHorizontal: 18,
          paddingTop: dashboardTopPadding + 191,
        }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[colors.pandaCardHighlight, colors.pandaCard]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.pandaCard}
        >
          <View style={styles.pandaCardTop}>
            <Text style={[styles.pandaCardLabel, { color: colors.pandaCardInk }]}>PANDA CREDIT</Text>
            <PandaLogo size={32} />
          </View>
          <View style={[styles.cardChip, { backgroundColor: colors.mastercardYellow }]}>
            <View style={styles.cardChipLine} />
            <View style={styles.cardChipLine} />
          </View>
          <Text style={[styles.cardNumber, { color: colors.pandaCardInk }]}>•••• 1000</Text>
          <View style={styles.cardholderRow}>
            <View>
              <Text style={[styles.cardholderLabel, { color: colors.pandaCardMuted }]}>CARDHOLDER</Text>
              <Text style={[styles.cardholderName, { color: colors.pandaCardInk }]}>{cardholderName}</Text>
            </View>
          </View>
        </LinearGradient>
        <Pressable
          accessibilityLabel="Apply for Panda Credit"
          accessibilityRole="link"
          onPress={() => void Linking.openURL(PANDA_CREDIT_APPLICATION_URL)}
          style={({ pressed }) => [
            styles.applyCard,
            { backgroundColor: colors.green800 },
            pressed && styles.pressed,
          ]}
          testID="apply-for-panda-credit"
        >
          <View style={[styles.applyIcon, { backgroundColor: colors.honey }]}>
            <Feather name="arrow-up-right" size={17} color={colors.green900} />
          </View>
          <View style={styles.applyCopy}>
            <Text style={[styles.applyTitle, { color: colors.primaryForeground }]}>Apply for Panda Credit</Text>
            <Text style={[styles.applyBody, { color: colors.mint300 }]}>Complete the short application form to get started.</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.primaryForeground} />
        </Pressable>
        <Pressable
          accessibilityLabel="View Panda privacy policy inside the app"
          accessibilityRole="button"
          onPress={() => setPrivacyOpen(true)}
          style={({ pressed }) => [
            styles.privacyLink,
            { backgroundColor: colors.card, borderColor: colors.border },
            pressed && styles.pressed,
          ]}
          testID="credit-privacy-link"
        >
          <Ionicons name="shield-checkmark-outline" size={17} color={colors.green700} />
          <Text style={[styles.privacyLinkText, { color: colors.green700 }]}>Privacy policy</Text>
          <Feather name="chevron-right" size={16} color={colors.green700} />
        </Pressable>
        <View style={[styles.planCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.planHeader}>
            <View>
              <Text style={[styles.planEyebrow, { color: colors.green700 }]}>PAYMENT PLAN</Text>
              <Text style={[styles.planTitle, { color: colors.foreground }]}>Next three payments</Text>
            </View>
            <View style={[styles.ratePill, { backgroundColor: colors.goldSoft }]}>
              <Text style={[styles.rateText, { color: colors.honeyInk }]}>12% flat rate</Text>
            </View>
          </View>
          <View style={[styles.planSummary, { backgroundColor: colors.secondary }]}>
            <View>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>TOTAL TO REPAY</Text>
              <Text style={[styles.summaryAmount, { color: colors.foreground }]}>£{totalRepayment.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryRight}>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>FLAT CHARGE</Text>
              <Text style={[styles.summaryCharge, { color: colors.honeyInk }]}>+ £{flatCharge.toFixed(2)}</Text>
            </View>
          </View>
          <Text style={[styles.planNote, { color: colors.mutedForeground }]}>
            £1,000.00 credit with a single 12% flat charge, split across three monthly payments.
          </Text>
          <View style={styles.paymentList}>
            {paymentSchedule.map((payment, index) => (
              <View
                key={payment.label}
                style={[
                  styles.paymentRow,
                  index < paymentSchedule.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 1 },
                ]}
              >
                <View style={[styles.paymentNumber, { backgroundColor: colors.mint100 }]}>
                  <Text style={[styles.paymentNumberText, { color: colors.green700 }]}>{index + 1}</Text>
                </View>
                <View style={styles.paymentCopy}>
                  <Text style={[styles.paymentLabel, { color: colors.foreground }]}>{payment.label}</Text>
                  <Text style={[styles.paymentTiming, { color: colors.mutedForeground }]}>{payment.timing}</Text>
                </View>
                <Text style={[styles.paymentAmount, { color: colors.foreground }]}>{payment.amount}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.infoIcon, { backgroundColor: colors.secondary }]}>
            <Feather name="zap" size={18} color={colors.green700} />
          </View>
          <View style={styles.infoCopy}>
            <Text style={[styles.infoTitle, { color: colors.foreground }]}>Simple, flexible spending</Text>
            <Text style={[styles.infoBody, { color: colors.mutedForeground }]}>
              Panda Credit will be available for eligible reservations and partner offers.
            </Text>
          </View>
        </View>
      </ScrollView>
      <View
        pointerEvents="box-none"
        style={[
          styles.dashboardHeader,
          { backgroundColor: colors.background, paddingTop: dashboardTopPadding },
        ]}
      >
        <Text style={[styles.eyebrow, { color: colors.green700 }]}>PANDA CREDIT</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Your credit</Text>
        <View style={[styles.balanceCard, { backgroundColor: colors.green800 }]}>
          <View style={styles.balanceTop}>
            <Text style={[styles.balanceLabel, { color: colors.mint300 }]}>AVAILABLE BALANCE</Text>
            <Ionicons name="wallet-outline" size={20} color={colors.honey} />
          </View>
          <Text style={[styles.balance, { color: colors.primaryForeground }]}>£1,000.00</Text>
          <Text style={[styles.balanceBody, { color: colors.mint300 }]}>
            Ready for eligible reservations and partner offers.
          </Text>
        </View>
      </View>
      <PrivacyPolicyModal visible={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </View>
  );
}

function PrivacyPolicyModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.privacyModalRoot, { backgroundColor: colors.background }]}>
        <View style={[styles.privacyModalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.privacyModalTitle, { color: colors.foreground }]}>Privacy policy</Text>
            <Text style={[styles.privacyModalSubtitle, { color: colors.mutedForeground }]}>Panda legal</Text>
          </View>
          <Pressable
            accessibilityLabel="Close privacy policy"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.privacyCloseButton,
              { backgroundColor: colors.secondary },
              pressed && styles.pressed,
            ]}
          >
            <Feather name="x" size={20} color={colors.green700} />
          </Pressable>
        </View>
        {Platform.OS === 'web'
          ? createElement('iframe', {
              title: 'Panda privacy policy',
              src: PRIVACY_POLICY_URL,
              sandbox: 'allow-scripts allow-same-origin',
              style: {
                border: 0,
                flex: 1,
                height: '100%',
                width: '100%',
              },
            })
          : (
            <WebView
              source={{ uri: PRIVACY_POLICY_URL }}
              originWhitelist={['https://*']}
              startInLoadingState
              setSupportMultipleWindows={false}
              style={styles.privacyWebView}
            />
          )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  dashboardHeader: {
    elevation: 8,
    left: 0,
    paddingHorizontal: 18,
    position: 'absolute',
    right: 0,
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    top: 0,
    zIndex: 10,
  },
  eyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1.4 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.8, marginTop: 4 },
  balanceCard: {
    borderRadius: 16,
    elevation: 5,
    marginTop: 18,
    minHeight: 105,
    padding: 14,
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
  },
  balanceTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  balanceLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 1.1 },
  balance: { fontFamily: 'Inter_700Bold', fontSize: 34, letterSpacing: -1, marginTop: 5 },
  balanceBody: { fontFamily: 'Inter_500Medium', fontSize: 10, lineHeight: 13, marginTop: 2, maxWidth: 290 },
  pandaCard: {
    borderRadius: 22,
    elevation: 5,
    marginTop: 16,
    minHeight: 214,
    overflow: 'hidden',
    padding: 20,
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
  },
  pandaCardTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  pandaCardLabel: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.1 },
  cardChip: {
    borderRadius: 6,
    height: 30,
    justifyContent: 'space-evenly',
    marginTop: 43,
    paddingHorizontal: 6,
    width: 40,
  },
  cardChipLine: { backgroundColor: '#A90F2B', borderRadius: 999, height: 2, width: '100%' },
  cardNumber: { fontFamily: 'Inter_600SemiBold', fontSize: 20, letterSpacing: 2.4, marginTop: 13 },
  cardholderRow: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginTop: 17 },
  cardholderLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 1.1 },
  cardholderName: { fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 0.7, marginTop: 3 },
  applyCard: {
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 11,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  applyIcon: { alignItems: 'center', borderRadius: 11, height: 34, justifyContent: 'center', width: 34 },
  applyCopy: { flex: 1 },
  applyTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  applyBody: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 15, marginTop: 3 },
  privacyLink: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  privacyLinkText: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 12 },
  pressed: { opacity: 0.7 },
  privacyModalRoot: { flex: 1 },
  privacyModalHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'web' ? 18 : 52,
    paddingBottom: 13,
  },
  privacyModalTitle: { fontFamily: 'Inter_700Bold', fontSize: 19 },
  privacyModalSubtitle: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 2 },
  privacyCloseButton: { alignItems: 'center', borderRadius: 999, height: 38, justifyContent: 'center', width: 38 },
  privacyWebView: { flex: 1 },
  planCard: {
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 16,
    padding: 16,
  },
  planHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  planEyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 1.2 },
  planTitle: { fontFamily: 'Inter_700Bold', fontSize: 19, marginTop: 3 },
  ratePill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 7 },
  rateText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  planSummary: {
    alignItems: 'center',
    borderRadius: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
    padding: 12,
  },
  summaryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 1 },
  summaryAmount: { fontFamily: 'Inter_700Bold', fontSize: 22, marginTop: 4 },
  summaryRight: { alignItems: 'flex-end' },
  summaryCharge: { fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 8 },
  planNote: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 11 },
  paymentList: { marginTop: 7 },
  paymentRow: { alignItems: 'center', flexDirection: 'row', minHeight: 55, paddingVertical: 8 },
  paymentNumber: { alignItems: 'center', borderRadius: 999, height: 27, justifyContent: 'center', width: 27 },
  paymentNumberText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  paymentCopy: { flex: 1, marginLeft: 10 },
  paymentLabel: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  paymentTiming: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 },
  paymentAmount: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  infoCard: { alignItems: 'flex-start', borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 13, marginTop: 16, padding: 16 },
  infoIcon: { alignItems: 'center', borderRadius: 12, height: 36, justifyContent: 'center', width: 36 },
  infoCopy: { flex: 1 },
  infoTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  infoBody: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 4 },
});