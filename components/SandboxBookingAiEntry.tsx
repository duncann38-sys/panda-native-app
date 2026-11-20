import {Pressable,StyleSheet,Text,View} from 'react-native';
import {PandaIcon} from '@/components/PandaIcon';
import {useColors} from '@/hooks/useColors';
export function SandboxBookingAiEntry({enabled,onPress}:{enabled:boolean;onPress:()=>void}){
  const colors=useColors();
  if(!enabled)return null;
  return <Pressable onPress={onPress} accessibilityRole="button"
    accessibilityLabel="Try a test reservation. OpenTable Sandbox 264001, private sandbox, no real tables or payments"
    style={({pressed})=>[styles.entry,{backgroundColor:colors.goldSoft,borderColor:colors.goldLine},pressed&&{opacity:0.8}]}>
    <View style={[styles.icon,{backgroundColor:colors.card}]}><PandaIcon name="calendar" size={16} color={colors.goldDeep}/></View>
    <View style={styles.copy}>
      <Text numberOfLines={1} style={[styles.title,{color:colors.goldDeep}]}>Try a test reservation</Text>
      <Text numberOfLines={1} style={[styles.note,{color:colors.honeyInk}]}>Private sandbox · OpenTable 264001 · no real tables or payments</Text>
    </View>
  </Pressable>;
}
const styles=StyleSheet.create({
  entry:{marginHorizontal:16,marginTop:10,marginBottom:2,borderWidth:StyleSheet.hairlineWidth,borderRadius:16,paddingVertical:8,paddingHorizontal:10,minHeight:48,flexDirection:'row',alignItems:'center',gap:10},
  icon:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center'},
  copy:{flex:1},title:{fontFamily:'Inter_600SemiBold',fontSize:13},
  note:{fontFamily:'Inter_400Regular',fontSize:10.5,marginTop:1,opacity:0.85},
});
