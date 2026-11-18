import {Pressable,StyleSheet,Text,View} from 'react-native';
import {PandaIcon} from '@/components/PandaIcon';
import {useColors} from '@/hooks/useColors';
export function SandboxBookingAiEntry({enabled,onPress}:{enabled:boolean;onPress:()=>void}){
  const colors=useColors();
  if(!enabled)return null;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Test a native OpenTable booking with Panda AI"
    style={[styles.entry,{backgroundColor:colors.card,borderColor:colors.border}]}>
    <View style={styles.copy}><Text style={[styles.label,{color:colors.green700}]}>PANDA AI · PRIVATE SANDBOX</Text>
      <Text style={[styles.title,{color:colors.text}]}>Try a test reservation</Text>
      <Text style={[styles.note,{color:colors.mutedForeground}]}>OpenTable Sandbox — 264001 · No real tables or payments</Text></View>
    <PandaIcon name="calendar" size={20} color={colors.green700}/>
  </Pressable>;
}
const styles=StyleSheet.create({
  entry:{marginHorizontal:14,marginTop:10,marginBottom:4,borderWidth:1,borderRadius:18,padding:14,flexDirection:'row',alignItems:'center',gap:10},
  copy:{flex:1},label:{fontFamily:'Inter_700Bold',fontSize:10,letterSpacing:1},title:{fontFamily:'Inter_700Bold',fontSize:16,marginTop:5},
  note:{fontFamily:'Inter_400Regular',fontSize:11,lineHeight:16,marginTop:4},
});
