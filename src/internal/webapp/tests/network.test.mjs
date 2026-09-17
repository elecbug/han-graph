import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {layoutNetwork, edgePaths, renderNetworkSVG} from '../static/network.mjs';
import {segmentHitsBox} from '../static/network-routing.mjs';

const read=name=>fs.readFileSync(new URL(`../../../../dataset/${name}`,import.meta.url),'utf8').trim().split('\n').map(JSON.parse);
const words=read('word.jsonl'), characters=read('character.jsonl');
function neighborhood(selected) {
  const roots=[...new Set(selected.components)];
  const connected=words.filter(word=>word.components.some(glyph=>roots.includes(glyph)));
  const glyphs=[...new Set([...roots,...connected.flatMap(word=>word.components)])];
  return {roots,words:connected,characters:glyphs.map(hanja=>({hanja,readings:characters.filter(c=>c.hanja===hanja)}))};
}

test('all direct neighbors are laid out once, with a clickable edge per word', () => {
  const selected=words.find(word=>word.hanja==='感覺');
  const network=neighborhood(selected), layout=layoutNetwork(network,selected);
  assert.deepEqual(layout.nodes.map(node=>node.hanja).sort(),network.characters.map(character=>character.hanja).sort());
  assert.deepEqual(layout.edges.map(edge=>JSON.stringify([edge.word.word,edge.word.hanja])).sort(),network.words.map(word=>JSON.stringify([word.word,word.hanja])).sort());
  assert.deepEqual(layout.nodes.filter(node=>node.root).map(node=>node.hanja),['感','覺']);
  assert.deepEqual(layout.edges.filter(edge=>edge.current).map(edge=>edge.word.hanja),['感覺']);
  assert(!layout.nodes.some(node=>node.hanja==='監'), 'do not expand the neighbors a second time');
  assert(layout.nodes.some(node=>node.hanja==='激'), 'include the newly connected 감격');
  assert(!layout.nodes.some(node=>node.hanja==='勵'), 'do not expand from 激 to 격려');
  assert(layout.nodes.some(node=>node.hanja==='愧'), 'include the newly connected 자괴감');
  assert(!layout.nodes.some(node=>node.hanja==='羞'), 'do not expand from 愧 to 수괴');
  assert(layout.nodes.some(node=>node.hanja==='鈍'), 'include the newly connected 둔감');
  assert(!layout.nodes.some(node=>node.hanja==='愚'), 'do not expand from 鈍 to 우둔');
  for(const glyph of ['淸','涼','諒','解','書'])assert(layout.nodes.some(node=>node.hanja===glyph), 'include 청량감 and 양해각서');
  for(const glyph of ['荒','恕'])assert(!layout.nodes.some(node=>node.hanja===glyph), 'do not expand the new neighbors again');
  assert(layout.nodes.some(node=>node.hanja==='銘'), 'include the newly connected 감명');
  for(const glyph of ['碑','墓'])assert(!layout.nodes.some(node=>node.hanja===glyph), 'do not expand 銘 to 비명 or 묘지명');
  for(const glyph of ['侮','辱','蔑'])assert(layout.nodes.some(node=>node.hanja===glyph), 'include 모욕감 and 모멸감');
  assert(layout.nodes.some(node=>node.hanja==='輕'), 'include the directly connected 경멸감');
  assert(!layout.edges.some(edge=>edge.word.hanja==='侮辱'||edge.word.hanja==='侮蔑'), 'only words containing a selected root belong in the neighborhood');
  assert(layout.nodes.some(node=>node.hanja==='敏'), 'include 민감');
  for(const glyph of ['銳','機'])assert(!layout.nodes.some(node=>node.hanja===glyph), 'do not expand from 敏 to 예민 or 기민');
  assert.deepEqual(layout,layoutNetwork(network,selected), 'layout must be deterministic');
});

test('long compounds, duplicate readings, homographs and repeated glyphs retain identity', () => {
  for(const hanja of ['勇敢無雙','降伏','各各','康健','句句節節','兔死狗烹','龜裂','菊花茶','陸軍','旅券','阿鼻叫喚','跆拳道','糾正','規定','僅僅','僅僅扶持','千斤萬斤','極端','劇團','勤勉','僅免','禽獸','錦繡','利己','樂器','其間','期間','猜忌','時期','幾何級數','豈弟','許諾','難易度','娘娘','那落','奈落','女子','年度','寧日','喜怒哀樂','惱殺','泥土','綠茶','茶道','怒發大發','但書','端緖','但書條項','但願桑麻成','剛斷','講壇','端正','斷定','短期','檀紀','文壇','文段','弄談','濃淡','正當','政黨','唐代','當代','冷淡','雪糖','砂糖','淡淡','堂堂','檀君神話','檀君朝鮮','荒唐無稽','地圖','指導','圖章','塗裝','矯導','敎徒','連帶','列島','挑戰狀','殺到','單刀直入','周到綿密','武陵桃源','待接','接待','首都','水稻','顚倒','前途','獨自','讀者','冬至','同志','共同','空洞','朗讀','洞察','洞窟','陸稻','督促狀','水稻作','稻熱病','陶瓷器','養豚場','同時','童詩','凍傷','銅像','段落','短絡','産卵','散亂','漏斗','羅列','網羅','娛樂','樂園','樂觀','落下','下落','卵子','亂離','欄干','空欄','鈍感','北斗七星','森羅萬象','冷凍庫','連絡處','廣告欄','蘭草','春蘭','東洋蘭','濫用','氾濫','浪費','風浪','郞君','新郞','花郞','花郞徒','畫廊','廊下','來日','掠奪','擄掠','掠奪品','省略','略圖','兩分','涼風','淸涼感','良心','棟梁','梁木','梁上君子','糧食','食糧','軍糧米','諒解','海諒','諒解覺書','念慮','旅行','奬勵金','奬勵','壯麗','考慮','高麗','連帶','聯隊','歷史','履歷','曆法','陽曆','月曆','練習','練習帳','憐憫','同病相憐','戀愛','失戀','聯合','聯合軍','蓮根','鍛鍊','鍊磨','製鍊','精鍊','列車','劣等','優劣','分裂','決裂','裂傷','廉價','破廉恥','狩獵','獵銃','命令','領收證','大統領','分水嶺','峻嶺','大關嶺','嶺東','零點','零細','靈魂','英靈','例外','慣例','冠禮','禮節','失禮','奴隸','隷書','隷屬國','隷屬民','勞動','勤勞','努力','勞力','老人','長老','露出','暴露','白露','鎔鑛爐','電氣爐','香爐','綠陰','新綠','祿俸','俸祿','官祿','目錄','鹿茸','鹿角','逐鹿','指鹿爲馬','論理','討論','戲弄','嘲弄','弄奸','信賴','無賴漢','依賴人','依賴書','雷雨','落雷','避雷針','材料','料金','完了','終了','修了','滿了','未完了','同僚愛','官僚制','龍宮','靑龍','登龍門','屢次','屢屢','屢代','樓臺','樓亭','望樓','淚腺','淚液','落淚','漏泄','累積','連累','累卵','楊柳','柳葉','柳枝','柳暗花明','蒲柳之質','留學','分類','六面體','六何原則','大陸','倫理','人倫','倫理學','年輪','輪廓','輪廻','車輪','法律','規律','旋律','韻律','生栗','栗卵','乾栗','比率','確率','效率','統率','輕率','隆盛','興隆','隆陵','王陵','利益','利子','李花','桃李','李下不整冠','李氏','李花紋','鄕里','里長','千里','萬里','鄕吏','胥吏','吏胥','吏房','履行','履歷書','履修','如履薄氷','梨花','梨園','梨汁','梨木','梨花酒','表裏','裏面','表裏不同','暗暗裏','近鄰','鄰接','鄰近','善鄰','鄰國','森林','山林','林業','林野','竹林','臨時','臨迫','臨席','君臨','降臨','磨耗','磨滅','切磋琢磨','磨製石器','麻痺','麻醉','麻布','莫大','莫強','莫論','莫逆','開幕','閉幕','字幕','內幕','沙漠','漠漠','漠然','廣漠','沙漠化','晚年','晚秋','晚餐','晚學','大器晚成','滿足','滿員','充滿','萬物','萬事','倨慢','傲慢','怠慢','緩慢','慢性','漫畫','散漫','漫談','天眞爛漫','週末','月末','年末','死亡','滅亡','亡命','多忙','奔忙','忙中閑','公私多忙','忙中','健忘症','忘年之交','忘恩','備忘錄','妄言','妄動','妄想','虛妄','輕擧妄動','罔極','罔測','欺君罔上','罔極之恩','茫茫','茫然','茫漠','蒼茫','茫然自失','姊妹','男妹','妹夫','妹弟','兄弟姊妹','每日','每週','每月','每年','每番','買收','買入','購買','買賣','買占','賣店','販賣','埋藏','埋葬','埋沒','埋設','埋立','媒體','仲媒','媒介體','觸媒','梅花','梅實','靑梅','紅梅','雪中梅','麥酒','小麥','大麥','麥芽','麥芽糖','脈搏','血脈','山脈','人脈','孟子','孟母','孟春','孟夏','孟母三遷之敎','猛獸','同盟','盟約','加盟','盟誓','盲人','文盲','盲點','盲目','盲信','免除','免許','免疫','勉學','勉學熱','睡眠','不眠','熟眠','不眠症','綿密','綿花','綿織物','綿絲','消滅','姓名','本名','名稱','生命','運命','共鳴','悲鳴','耳鳴','鳴禽','冥想','冥福','冥界','冥府','幽冥','座右銘','銘文','感銘','碑銘','墓誌銘','日暮','暮年','暮春','朝三暮四','朝令暮改','毛髮','羊毛','脫毛','毛織物','侮辱','輕侮','侮蔑','侮辱感','侮蔑感','冒險','冒險家','冒險心','冒險談','冒瀆','募集','募金','應募','公募','募兵','追慕','欽慕','思慕','敬慕','某氏','某處','某年','某月','某日','模型','模範','模倣','模擬','共謀','陰謀','謀議','謀略','圖謀','外貌','容貌','全貌','變貌','面貌','目的','目標','注目','牧場','牧畜','牧草','遊牧','放牧','和睦','親睦','親睦會','不睦','沒收','沒落','日沒','惡夢','吉夢','解夢','夢想','夢遊病','蒙昧','蒙恩','童蒙','蒙昧無知','卯時','乙卯','丁卯','己卯','奇妙','微妙','妙案','絕妙','墓地','省墓','墓碑','陵墓','宗廟','文廟','祠廟','廟堂','孔廟','苗木','育苗','種苗','苗床','苗圃','業務','事務','義務','任務','戊子','戊辰','戊寅','戊申','戊戌','武術','武力','武裝','舞踊','群舞','獨舞','茂盛','茂林','茂才','繁茂','茂林修竹','貿易','貿易商','貿易港','貿易業','自由貿易','濃霧','煙霧','噴霧','雲霧','霧散','水墨','水墨畫','墨香','墨色','筆墨','沈默','默念','默認','質問','疑問','訪問','新聞','所聞','見聞','傳聞','正門','入門','專門','勿論','勿驚','勿忘','勿忘草','勿失好機','意味','趣味','別味','風味','尾行','末尾','魚尾','未熟','白米','玄米','米穀','米飮','美術','美人','微細','微弱','眉間','白眉','蛾眉','眉目','焦眉之急','迷路','迷信','迷兒','昏迷','迷惑','國民','市民','住民','憫惘','憫然','憫恤','惻憫','敏感','銳敏','機敏','英敏','明敏','秘密','蜜月','蜜蠟','蜜源','蜜腺','糖蜜','素朴','淳朴','質朴','敦朴','朴氏','博士','博學','該博','拍手','拍子','拍動','拍車','拍手喝采','宿泊','碇泊','外泊','一泊','薄氷','稀薄','輕薄','壓迫','脅迫','切迫','折半','上半期','下半期','反應','反省','飯饌','朝飯','白飯','飯酒','茶飯事','同伴','同伴者','伴侶','伴奏','背叛','叛逆','叛軍','謀叛','班長','班員','分班','兩班','首班','音盤','圓盤','骨盤','一般','一般的','全般','諸般','萬般','返還','返送','返納','返戾','返品','拔萃','拔擢','選拔','白髮','頭髮','長髮','理髮','廚房','工房','放送','方向','方法','地方','探訪','來訪','禮訪','訪問客','豫防','防禦','防止','防火','模倣品','模倣作','模倣者','模倣心','傍觀','傍聽','傍證','傍系','傍點','妨害','妨害物','妨害者','妨害電波','無妨','芳香','芳香劑','芳名錄','芳年','芳草','友邦','異邦','異邦人','萬邦','敬拜','禮拜','參拜','拜禮','歲拜','乾杯','祝杯','聖杯','苦杯','優勝杯','倍數','倍加','倍增','倍率','倍額','栽培','培養','培養液','培養土','栽培法','排出','排列','排除','排水','排泄','背後','違背','背水陣','先輩','後輩','同輩','年輩','輩出','配達','配分','配置','配偶者','百年','百姓','百貨店','伯父','伯母','伯仲','伯爵','畫伯','番號','順番','當番','番地','煩雜','煩多','煩悶','繁盛','繁榮','繁殖','飜譯','飜覆','飜案','飜譯家','飜譯文','伐木','征伐','討伐','伐採','處罰','刑罰','罰金','罰則','天罰','平凡','非凡','凡人','凡常','凡例','犯罪','犯人','共犯','再犯','侵犯','範圍','壁面','壁畫','障壁','絕壁','外壁','碧空','碧海','碧眼','碧波','桑田碧海','丙子','病者','報道','步道','報告','寶庫','普及','補給','祈福','起伏','刺繡屛風','竝列','普及率','樂譜','年譜','辨證法','詭辯','富者','父子','富裕','浮游','卜筮','封套','鳳凰','鳳凰紋','鳳凰圖','奉養','扶養','占卜','卜占','夫婦','扶養家族','連峯','龍鳳','腹部','最高峯','蜂群','覆面','名簿','粉碎','紛紛','附錄','念佛','紛亂','東奔西走','自由奔放','負荷','詩賦','赴擧','副作用','家計簿','符籍','音符','油腐','封墳','奮戰','支拂','拂入','拂拭','拂下','拂子','朋友','朋黨政治','朋比','朋友有信','崩落','崩御','土崩瓦解','雪崩','非常','飛上','是非','侍婢','鼻腔','卑怯','王世子妃','妃嬪','批准','批准書','批評家','紀念碑','祕書','神祕','祕法','肥料','堆肥','來賓','多頻度']) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert.equal(new Set(layout.nodes.map(node=>node.hanja)).size,layout.nodes.length);
    const edge=layout.edges.find(edge=>edge.current);
    assert.deepEqual(edge.word.components,selected.components);
    if(hanja==='勇敢無雙')assert.equal(edge.glyphs.length,4);
    if(hanja==='降伏')assert.equal(layout.nodes.find(node=>node.hanja==='降').readings.length,2);
    if(['比率','確率','效率','統率','輕率','倍率','普及率'].includes(hanja))assert.equal(layout.nodes.find(node=>node.hanja==='率').readings.length,3);
    if(hanja==='龜裂')assert.equal(layout.nodes.find(node=>node.hanja==='龜').readings.length,3);
    if(hanja==='菊花茶')assert.equal(layout.nodes.find(node=>node.hanja==='茶').readings.length,2);
    if(hanja==='陸軍')assert.equal(layout.nodes.find(node=>node.hanja==='陸').readings.length,2);
    if(hanja==='旅券')assert.equal(layout.nodes.find(node=>node.hanja==='旅').readings.length,2);
    if(hanja==='利己')assert.equal(layout.nodes.find(node=>node.hanja==='利').readings.length,2);
    if(['樂器','娛樂','樂園','樂觀','樂譜'].includes(hanja))assert.equal(layout.nodes.find(node=>node.hanja==='樂').readings.length,3);
    for(const [word,glyph] of [['豈弟','豈'],['許諾','諾'],['難易度','易'],['娘娘','娘'],['奈落','奈'],['女子','女'],['年度','年'],['寧日','寧'],['喜怒哀樂','怒'],['惱殺','殺'],['泥土','泥'],['綠茶','綠'],['茶道','茶'],['弄談','弄'],['冷淡','冷'],['雪糖','糖'],['砂糖','糖'],['連帶','連'],['列島','列'],['挑戰狀','狀'],['殺到','殺'],['朗讀','朗'],['洞察','洞'],['洞窟','洞'],['陸稻','陸'],['督促狀','狀'],['漏斗','漏'],['羅列','羅'],['網羅','羅'],['落下','落'],['下落','落'],['卵子','卵'],['産卵','卵'],['亂離','亂'],['散亂','亂'],['欄干','欄'],['空欄','欄'],['蘭草','蘭'],['濫用','濫'],['浪費','浪'],['郞君','郞'],['花郞','郞'],['畫廊','廊'],['廊下','廊'],['來日','來'],['掠奪','掠'],['擄掠','掠'],['省略','省'],['略圖','略'],['兩分','兩'],['涼風','涼'],['淸涼感','涼'],['良心','良'],['棟梁','梁'],['梁木','梁'],['糧食','糧'],['食糧','糧'],['諒解','諒'],['海諒','諒'],['念慮','念'],['歷史','歷'],['履歷','履'],['曆法','曆'],['陽曆','曆'],['練習','練'],['憐憫','憐'],['戀愛','戀'],['聯合','聯'],['蓮根','蓮'],['鍛鍊','鍊'],['鍊磨','鍊'],['列車','列'],['劣等','劣'],['優劣','劣'],['分裂','裂'],['決裂','裂'],['裂傷','裂'],['廉價','廉'],['破廉恥','廉'],['狩獵','獵'],['獵銃','獵'],['命令','令'],['領收證','領'],['大統領','領'],['分水嶺','嶺'],['嶺東','嶺'],['零點','零'],['靈魂','靈'],['英靈','靈'],['例外','例'],['慣例','例'],['禮節','禮'],['失禮','禮'],['隷書','隷'],['勞動','勞'],['勤勞','勞'],['老人','老'],['長老','老'],['露出','露'],['暴露','露'],['白露','露'],['祿俸','祿'],['俸祿','祿'],['目錄','錄'],['鹿茸','鹿'],['逐鹿','鹿'],['指鹿爲馬','鹿'],['論理','論'],['討論','論'],['雷雨','雷'],['落雷','雷'],['材料','料'],['料金','料'],['龍宮','龍'],['靑龍','龍'],['登龍門','龍'],['屢次','屢'],['屢屢','屢'],['屢代','屢'],['樓臺','樓'],['樓亭','樓'],['望樓','樓'],['淚腺','淚'],['淚液','淚'],['落淚','淚'],['累積','累'],['連累','累'],['累卵','累'],['楊柳','柳'],['柳葉','柳'],['柳暗花明','柳'],['蒲柳之質','柳'],['留學','留'],['六面體','六'],['六何原則','六'],['倫理','倫'],['人倫','倫'],['年輪','輪'],['輪廓','輪'],['輪廻','輪'],['法律','律'],['規律','律'],['旋律','律'],['韻律','律'],['生栗','栗'],['栗卵','栗'],['乾栗','栗'],['隆盛','隆'],['興隆','隆'],['隆陵','隆'],['利益','利'],['李花','李'],['桃李','李'],['李氏','李'],['李下不整冠','李'],['鄕里','里'],['里長','里'],['鄕吏','吏'],['胥吏','吏'],['吏胥','吏'],['履行','履'],['如履薄氷','履'],['梨花','梨'],['梨汁','梨'],['表裏','裏'],['裏面','裏'],['近鄰','鄰'],['鄰接','鄰'],['森林','林'],['林業','林'],['臨時','臨'],['君臨','臨'],['天眞爛漫','爛'],['年末','年'],['每年','年'],['忘年之交','年'],['備忘錄','錄'],['麥芽糖','糖'],['盟誓','誓'],['朝令暮改','令'],['陵墓','陵'],['王陵','陵'],['隆陵','陵'],['省墓','省'],['沒落','落'],['謀略','略'],['某年','年'],['不睦','不'],['茂林','林'],['茂林修竹','林'],['貿易','易'],['貿易商','易'],['貿易港','易'],['貿易業','易'],['自由貿易','易'],['默念','念'],['勿論','論'],['迷路','路'],['糖蜜','糖'],['拍車','車'],['切迫','切'],['反省','省'],['茶飯事','茶'],['兩班','兩'],['理髮','理'],['論理','理'],['來訪','來'],['禮訪','禮'],['禮拜','禮'],['拜禮','禮'],['芳名錄','錄'],['芳年','年'],['排列','列'],['年輩','年'],['百年','年'],['凡例','例'],['竝列','列'],['年譜','年'],['連峯','連'],['龍鳳','龍'],['附錄','錄'],['念佛','念'],['紛亂','亂'],['崩落','落'],['紀念碑','念'],['肥料','料'],['來賓','來']]) {
      if(hanja===word)assert.equal(layout.nodes.find(node=>node.hanja===glyph).readings.length,2,`${word}: ${glyph} should retain both registered readings`);
    }
    if(hanja==='那落'||hanja==='奈落') {
      assert.equal(layout.edges.filter(item=>item.word.word==='나락').length,2);
      assert.equal(layout.edges.filter(item=>item.current).length,1);
      assert.equal(edge.word.hanja,hanja);
    }
    if(hanja==='其間'||hanja==='期間') {
      assert.equal(layout.edges.filter(item=>item.word.word==='기간').length,2);
      assert.equal(layout.edges.filter(item=>item.current).length,1);
      assert.equal(edge.word.hanja,hanja);
    }
    if(['各各','僅僅','娘娘','淡淡','堂堂','屢屢','漠漠','茫茫','紛紛'].includes(hanja)) {
      assert.deepEqual(edge.glyphs,[selected.components[0]]);
      const paths=edgePaths(edge,layout.nodes);
      assert.equal(paths.length,2);
      assert.notEqual(paths[0],paths[1], 'a repeated glyph needs a visible loop');
    }
    if(hanja==='康健')assert.equal(layout.edges.filter(edge=>edge.word.word==='강건').length,2);
    if(['僅僅扶持','千斤萬斤','怒發大發'].includes(hanja)) {
      assert.equal(edge.glyphs.length,3);
      assert.equal(edge.word.components.length,4);
      assert.equal(layout.edges.filter(item=>item.word.hanja===hanja).length,1);
    }
    if(hanja==='句句節節') {
      assert.deepEqual(edge.glyphs,['句','節']);
      assert.deepEqual(edge.word.components,['句','句','節','節']);
      assert.equal(layout.edges.filter(item=>item.word.hanja===hanja).length,1);
    }
    if(hanja==='但書'||hanja==='端緖') {
      assert.equal(edge.word.word,'단서');
      assert.equal(edge.word.hanja,hanja);
      assert.equal(layout.edges.filter(item=>item.current).length,1);
    }
    if(['剛斷','講壇','端正','斷定','短期','檀紀','文壇','文段','弄談','濃淡','正當','政黨','唐代','當代','地圖','指導','圖章','塗裝','矯導','敎徒','首都','水稻','顚倒','前途','獨自','讀者','冬至','同志','共同','空洞','同時','童詩','凍傷','銅像','段落','短絡','産卵','散亂','花郞','畫廊','奬勵','壯麗','考慮','高麗','連帶','聯隊','冠禮','慣例','努力','勞力','屢代','樓臺','李花','梨花','鄕里','鄕吏','買占','賣店','埋藏','埋葬','悲鳴','碑銘','輕侮','敬慕','公募','共謀','模擬','謀議','暮年','某年','己卯','奇妙','宗廟','種苗','戊戌','武術','傳聞','專門','白米','白眉','飯酒','伴奏','伴侶','返戾','攻防','工房','方向','芳香','禮訪','豫防','吏房','異邦','排出','輩出','倍數','排水','凡人','犯人'].includes(hanja)) {
      assert.equal(edge.word.hanja,hanja);
      assert.equal(layout.edges.filter(item=>item.current).length,1);
    }
    if(hanja==='夫婦') {
      assert.deepEqual(edge.glyphs,['夫','婦'], 'identical readings must retain distinct characters');
      assert.equal(layout.nodes.filter(node=>['夫','婦'].includes(node.hanja)).length,2);
    }
    for(const forms of [['占卜','卜占'],['奉養','扶養']]) {
      if(forms.includes(hanja)) {
        for(const form of forms)assert(layout.edges.some(item=>item.word.hanja===form), 'shared characters must connect both words');
        assert.equal(layout.edges.filter(item=>item.current).length,1);
        assert.equal(edge.word.hanja,hanja);
      }
    }
    for(const [word,glyph,id] of [['卜筮','筮','seo-202'],['封套','套','tu-200'],['鳳凰','凰','hwang-202'],['浮游','游','yu-203'],['粉碎','碎','swae-201'],['拂拭','拭','sik-202'],['鼻腔','腔','gang-201'],['卑怯','怯','geop-200'],['妃嬪','嬪','bin-200'],['批准','准','jun-201'],['堆肥','堆','toe-200']]) {
      if(hanja===word)assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id), 'new component readings must be available in the graph');
    }
    if(hanja==='刺繡屛風')assert.equal(edge.word.word,'자수 병풍');
    if(hanja==='朋黨政治')assert.equal(edge.word.word,'붕당 정치');
    for(const [word,glyph,id,variant] of [['神祕','祕','bi-105','秘'],['秘密','秘','bi-202','祕']]) {
      if(hanja===word) {
        assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
        assert(!layout.nodes.some(node=>node.hanja===variant), 'different registered glyphs must not be merged solely as variants');
      }
    }
    if(hanja==='但書條項') {
      assert.equal(edge.word.word,'단서 조항');
      assert.equal(edge.glyphs.length,4);
    }
    if(['單刀直入','周到綿密','武陵桃源','北斗七星','森羅萬象','梁上君子','諒解覺書','同病相憐','指鹿爲馬','柳暗花明','蒲柳之質','六何原則','如履薄氷','表裏不同','切磋琢磨','磨製石器','大器晚成','天眞爛漫','公私多忙','忘年之交','輕擧妄動','欺君罔上','罔極之恩','茫然自失','兄弟姊妹','朝三暮四','朝令暮改','蒙昧無知','茂林修竹','自由貿易','勿失好機','妨害電波','桑田碧海','刺繡屛風','扶養家族','東奔西走','自由奔放','朋黨政治','朋友有信','土崩瓦解','王世子妃'].includes(hanja))assert.equal(edge.glyphs.length,4);
    if(hanja==='待接'||hanja==='接待') {
      assert(layout.edges.some(item=>item.word.hanja==='待接'));
      assert(layout.edges.some(item=>item.word.hanja==='接待'));
      assert.equal(edge.word.hanja,hanja);
      assert.equal(layout.edges.filter(item=>item.current).length,1);
    }
    if(hanja==='落下'||hanja==='下落') {
      assert(layout.edges.some(item=>item.word.hanja==='落下'));
      assert(layout.edges.some(item=>item.word.hanja==='下落'));
      assert.equal(edge.word.hanja,hanja);
      assert.equal(layout.edges.filter(item=>item.current).length,1);
    }
    if(['水稻作','稻熱病','陶瓷器','養豚場','督促狀','冷凍庫','連絡處','廣告欄','東洋蘭','花郞徒','掠奪品','淸涼感','軍糧米','奬勵金','練習帳','聯合軍','破廉恥','領收證','大統領','分水嶺','大關嶺','隷屬國','隷屬民','鎔鑛爐','電氣爐','無賴漢','依賴人','依賴書','避雷針','未完了','同僚愛','官僚制','登龍門','六面體','倫理學','李花紋','履歷書','梨花酒','沙漠化','忙中閑','健忘症','備忘錄','媒介體','雪中梅','麥芽糖','勉學熱','不眠症','綿織物','座右銘','墓誌銘','毛織物','侮辱感','侮蔑感','冒險家','冒險心','冒險談','親睦會','夢遊病','貿易商','貿易港','貿易業','水墨畫','勿忘草','副作用','家計簿','批准書','批評家','紀念碑','多頻度'].includes(hanja))assert.equal(edge.glyphs.length,3);
    if(hanja==='糧食'||hanja==='食糧') {
      assert(layout.edges.some(item=>item.word.hanja==='糧食'));
      assert(layout.edges.some(item=>item.word.hanja==='食糧'));
      assert.equal(edge.word.hanja,hanja);
      assert.equal(layout.edges.filter(item=>item.current).length,1);
    }
    if(['但願桑麻成','李下不整冠'].includes(hanja))assert.equal(edge.glyphs.length,5);
    if(hanja==='孟母三遷之敎') {
      assert.deepEqual(edge.glyphs,['孟','母','三','遷','之','敎']);
      assert.equal(edge.word.components.length,6);
      assert.equal(layout.edges.filter(item=>item.current).length,1);
    }
    for(const forms of [['輕侮','敬慕'],['公募','共謀'],['模擬','謀議'],['己卯','奇妙'],['宗廟','種苗'],['戊戌','武術'],['傳聞','專門'],['丙子','病者'],['報告','寶庫'],['普及','補給'],['祈福','起伏'],['富者','父子'],['富裕','浮游'],['冥府','名簿'],['非常','飛上'],['是非','侍婢']]) {
      if(forms.includes(hanja))assert(!layout.edges.some(item=>item.word.hanja===forms.find(form=>form!==hanja)), 'matching Hangul alone must not connect homographs');
    }
    if(['悲鳴','碑銘'].includes(hanja)) {
      const other=hanja==='悲鳴'?'碑銘':'悲鳴';
      assert(!layout.edges.some(item=>item.word.hanja===other), 'homographs without a shared root must remain separate');
    }
    if(hanja==='暗暗裏') {
      assert.deepEqual(edge.glyphs,['暗','裏']);
      assert.deepEqual(edge.word.components,['暗','暗','裏']);
      assert.equal(layout.edges.filter(item=>item.word.hanja===hanja).length,1);
    }
    if(['胥吏','吏胥'].includes(hanja)) {
      assert(layout.edges.some(item=>item.word.hanja==='胥吏'));
      assert(layout.edges.some(item=>item.word.hanja==='吏胥'));
      assert.equal(layout.edges.filter(item=>item.current).length,1);
    }
    for(const [query,forms] of [['이화',['李花','梨花']],['향리',['鄕里','鄕吏']],['매장',['埋藏','埋葬']],['모년',['暮年','某年']],['보도',['報道','步道']]]) {
      if(forms.includes(hanja))assert.equal(layout.edges.filter(item=>item.word.word===query).length,2);
    }
    if(hanja==='買賣') {
      assert.deepEqual(edge.glyphs,['買','賣'], 'identical readings must not merge different characters');
      assert.equal(layout.nodes.filter(node=>['買','賣'].includes(node.hanja)).length,2);
      assert.deepEqual(layout.edges.filter(item=>item.word.word==='매점').map(item=>item.word.hanja).sort(),['買占','賣店'].sort());
    }
    if(['買占','賣店'].includes(hanja)) {
      const other=hanja==='買占'?'賣店':'買占';
      assert(!layout.edges.some(item=>item.word.hanja===other), 'matching Hangul must not expand a second hop');
    }
  }
});

test('every dataset word has finite, unclipped positions without overlapping labels', () => {
  for(const selected of words) {
    const layout=layoutNetwork(neighborhood(selected),selected);
    const elements=[...layout.nodes,...layout.edges];
    for(const item of elements) {
      assert(Number.isFinite(item.x)&&Number.isFinite(item.y),selected.hanja);
      assert(item.x-item.width/2>=0 && item.x+item.width/2<=layout.width,selected.hanja);
      assert(item.y-item.height/2>=0 && item.y+item.height/2<=layout.height,selected.hanja);
    }
    for(let i=0;i<elements.length;i++)for(let j=i+1;j<elements.length;j++) {
      const a=elements[i],b=elements[j];
      const overlapX=(a.width+b.width)/2-Math.abs(a.x-b.x);
      const overlapY=(a.height+b.height)/2-Math.abs(a.y-b.y);
      assert(overlapX<=0||overlapY<=0,`${selected.hanja}: ${a.id} overlaps ${b.id}`);
    }
    for(const edge of layout.edges)for(const route of edge.routes) {
      assert(route.points.length>=2);
      for(const p of route.points)assert(Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=layout.width&&p.y>=0&&p.y<=layout.height,`${selected.hanja}: route outside canvas`);
      for(let i=1;i<route.points.length;i++)for(const other of elements) {
        if(other===edge||other.hanja===route.glyph)continue;
        // Routing has a 5px margin; reserve 2px here for stroke and rounded corners.
        const r={left:other.x-other.width/2-2,right:other.x+other.width/2+2,top:other.y-other.height/2-2,bottom:other.y+other.height/2+2};
        assert(!segmentHitsBox(route.points[i-1],route.points[i],r),`${selected.hanja}: ${edge.word.hanja} crosses ${other.id}`);
      }
    }
  }
});

test('words sharing Hanja retain separate selection and detail links', () => {
  for (const name of ['갱신','경신']) {
    const selected=words.find(word=>word.word===name && word.hanja==='更新');
    const layout=layoutNetwork(neighborhood(selected),selected);
    const shared=layout.edges.filter(edge=>edge.word.hanja==='更新');
    assert.deepEqual(shared.map(edge=>edge.word.word),['갱신','경신']);
    assert.deepEqual(layout.edges.filter(edge=>edge.current).map(edge=>edge.word.word),[name]);
    assert.equal(layout.nodes.find(node=>node.hanja==='更').readings.length,2);
    const svg=renderNetworkSVG(layout);
    for (const edge of shared) {
      const href=`#explore?${new URLSearchParams({word:edge.word.word,hanja:edge.word.hanja})}`.replaceAll('&','&amp;');
      assert.equal(svg.split(`href="${href}"`).length-1,2, 'edge line and label must preserve both word and Hanja');
    }
  }
});

test('an isolated character still appears, without invented edges', () => {
  const layout=layoutNetwork({roots:['綱'],characters:[{hanja:'綱',readings:[]}],words:[]});
  assert.equal(layout.nodes.length,1);
  assert.equal(layout.edges.length,0);
});

test('every character, edge label and edge line links to the correct detail route', () => {
  const selected=words.find(word=>word.hanja==='感覺');
  const layout=layoutNetwork(neighborhood(selected),selected);
  const svg=renderNetworkSVG(layout,{highlighted:'感'});
  const anchors=[...svg.matchAll(/<a\s+([^>]+)>/g)].map(match=>match[1]);
  const nodeLinks=anchors.filter(attributes=>attributes.includes('data-node-glyph='));
  const labelLinks=anchors.filter(attributes=>attributes.includes('data-edge-word='));
  const lineLinks=anchors.filter(attributes=>attributes.includes('network-line-link'));
  assert.equal(nodeLinks.length,layout.nodes.length);
  assert.equal(labelLinks.length,layout.edges.length);
  assert.equal(lineLinks.length,layout.edges.length);
  function params(attributes) {
    const href=attributes.match(/href="([^"]+)"/)[1].replaceAll('&amp;','&');
    assert(href.startsWith('#explore?'));
    return new URLSearchParams(href.split('?')[1]);
  }
  nodeLinks.forEach((link,index)=>assert.equal(params(link).get('character'),layout.nodes[index].hanja));
  for(const links of [labelLinks,lineLinks]) links.forEach((link,index)=>{
    assert.equal(params(link).get('word'),layout.edges[index].word.word);
    assert.equal(params(link).get('hanja'),layout.edges[index].word.hanja);
  });
  // Dataset text must never create extra elements or attributes in the SVG.
  layout.edges[0].word={...layout.edges[0].word,word:'"<script>alert(1)</script>',meaning_en:'<img src=x onerror=alert(1)>'};
  const escaped=renderNetworkSVG(layout,{lang:'en'});
  assert(!escaped.includes('<script>')&&!escaped.includes('<img'));
  assert(escaped.includes('&lt;script&gt;'));
});


test('vocabulary expansion 711–730 preserves graph identities', () => {
  for(const forms of [["仕官", "史官"], ["枯死", "古寺"], ["記事", "騎士", "己巳"], ["敎師", "校舍"], ["農事", "農舍"], ["事例", "謝禮"], ["相似", "上司"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["恰似", "恰", "heup-200"], ["類似", "類", "yu-204"], ["史料", "料", "ryo-000"], ["私立", "立", "rip-000"], ["謝禮", "禮", "rye-001"], ["類似", "類", "yu-204"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["招聘敎授", "초빙교수", 4], ["寄宿舍", "기숙사", 3], ["似而非", "사이비", 3]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 731–750 preserves graph identities', () => {
  for(const forms of [["斜陽", "辭讓"], ["調査", "弔辭"], ["沙金", "賜金"], ["沙場", "社長"], ["奉仕", "奉祀"], ["司會", "社會"], ["寺院", "社員"], ["大使", "大蛇"], ["私心", "邪心"], ["詐欺", "邪氣"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["描寫", "描", "myo-200"], ["斯文亂賊", "亂", "nan-201"], ["億萬斯年", "年", "nyeon-000"], ["切削", "切", "jeol-100"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["取捨選擇", "취사선택", 4], ["斯文亂賊", "사문난적", 4], ["億萬斯年", "억만사년", 4], ["畫蛇添足", "화사첨족", 4], ["朔望月", "삭망월", 3]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 751–770 preserves graph identities', () => {
  for(const forms of [["浮上", "負傷"], ["喪失", "桑實"], ["商街", "喪家"], ["初霜", "肖像"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["賠償", "賠", "bae-200"], ["臥薪嘗膽", "薪", "sin-200"], ["祥瑞", "瑞", "seo-203"], ["賞狀", "狀", "jang-201"], ["霜降", "降", "gang-003"], ["臨床", "臨", "im-201"], ["綠衣紅裳", "綠", "nok-200"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["雪上加霜", "설상가상", 4], ["臥薪嘗膽", "와신상담", 4], ["未嘗不", "미상불", 3], ["綠衣紅裳", "녹의홍상", 4], ["同價紅裳", "동가홍상", 4]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 771–790 preserves graph identities', () => {
  for(const forms of [["序列", "暑熱"], ["庶政", "敍情"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["閉塞", "塞", "saek-200"], ["梗塞", "梗", "gyeong-201"], ["摸索", "摸", "mo-202"], ["酷暑", "酷", "hok-200"], ["要塞", "塞", "sae-100"], ["閉塞", "塞", "saek-200"], ["宣誓", "誓", "seo-106"], ["盟誓", "誓", "se-200"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["塞翁之馬", "새옹지마", 4], ["徐徐", "서서", 1], ["誓約書", "서약서", 3], ["敍事詩", "서사시", 3]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 791–810 preserves graph identities', () => {
  for(const forms of [["解析", "解釋"], ["寶石", "保釋"], ["神仙", "新鮮"], ["先行", "善行"], ["改善", "凱旋"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["註釋", "註", "ju-203"], ["船舶", "舶", "bak-201"], ["斡旋", "斡", "al-200"], ["凱旋", "凱", "gae-201"], ["回旋", "旋", "seon-101"], ["朝鮮", "鮮", "seon-006"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["三寸之舌", "삼촌지설", 4], ["禪問答", "선문답", 3], ["長廣舌", "장광설", 3], ["回旋", "회선", 2], ["旋回", "선회", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 811–830 preserves graph identities', () => {
  for(const forms of []) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["流星", "流", "yu-205"], ["省略", "省", "saeng-200"], ["自省", "省", "seong-006"], ["年歲", "年", "yeon-200"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["自省", "자성", 2], ["洗手", "세수", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 831–850 preserves graph identities', () => {
  for(const forms of [["苦笑", "告訴"], ["召命", "昭明"], ["昭昭", "昭蘇"], ["疏遠", "訴願"], ["上疏", "上訴"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["掃蕩", "蕩", "tang-201"], ["騷擾", "擾", "yo-202"], ["迅速", "迅", "sin-201"], ["束縛", "縛", "bak-202"], ["粟粒", "粒", "rip-200"], ["滄海一粟", "滄", "chang-200"], ["騷亂", "亂", "ran-100"], ["更蘇", "更", "gaeng-000"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["昭昭", "소소", 1], ["昭蘇", "소소", 2], ["滄海一粟", "창해일속", 4], ["召喚狀", "소환장", 3], ["乾菜蔬", "건채소", 3]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 851–870 preserves graph identities', () => {
  for(const forms of [["遵守", "俊秀"], ["憂愁", "優秀"], ["搜索", "愁色"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["松津", "津", "jin-200"], ["松柏", "柏", "baek-200"], ["萬壽無疆", "疆", "gang-202"], ["朗誦", "朗", "nang-200"], ["老衰", "老", "no-202"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["萬壽無疆", "만수무강", 4], ["無病長壽", "무병장수", 4], ["鎖國政策", "쇄국정책", 4], ["誦讀", "송독", 2], ["讀誦", "독송", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 871–890 preserves graph identities', () => {
  for(const forms of [["必須", "必需"], ["須要", "需要"], ["垂訓", "殊勳"], ["長壽", "將帥"], ["修鍊", "睡蓮"], ["遂行", "隨行"], ["旗手", "騎手", "旣遂"], ["首班", "隨伴"], ["受給", "需給"], ["郡守", "軍需"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["誰怨誰咎", "咎", "gu-201"], ["雖則", "則", "jeuk-200"], ["須臾", "臾", "yu-206"], ["垂簾", "簾", "ryeom-200"], ["殊勳", "勳", "hun-200"], ["睡蓮", "蓮", "ryeon-103"], ["孰能禦之", "禦", "eo-200"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["誰某誰某", "수모수모", 2], ["誰怨誰咎", "수원수구", 3], ["孰是孰非", "숙시숙비", 3], ["國雖大好戰必亡", "국수대호전필망", 7], ["天下雖安忘戰必危", "천하수안망전필위", 8], ["必須科目", "필수 과목", 4]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 891–910 preserves graph identities', () => {
  for(const forms of [["貞淑", "靜肅"], ["技術", "記述"], ["拾得", "習得"], ["全勝", "傳承"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["純粹", "粹", "su-203"], ["搭乘", "搭", "tap-200"], ["巡禮", "禮", "rye-001"], ["巡廻", "廻", "hoe-201"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["脣亡齒寒", "순망치한", 4], ["瞬息間", "순식간", 3], ["拾得物", "습득물", 3], ["殉葬", "순장", 2], ["善循環", "선순환", 3], ["惡循環", "악순환", 3]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 911–930 preserves graph identities', () => {
  for(const forms of [["承服", "僧服"], ["始終", "侍從"], ["施行", "試行"], ["蔬食", "消息"], ["粉食", "粉飾"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["僧伽", "伽", "ga-200"], ["嚆矢", "嚆", "hyo-200"], ["矢鏃", "鏃", "chok-200"], ["流矢", "流", "yu-205"], ["僧侶", "侶", "ryeo-200"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["是是非非", "시시비비", 2], ["試運轉", "시운전", 3], ["昇降機", "승강기", 3], ["僧伽", "승가", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 931–950 preserves graph identities', () => {
  for(const forms of [["申告", "辛苦"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["辛辣", "辣", "ral-200"], ["辛酸", "酸", "san-200"], ["伸冤", "冤", "won-200"], ["十匙一飯", "匙", "si-202"], ["雙璧", "璧", "byeok-200"], ["昏定晨省", "省", "seong-006"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["千辛萬苦", "천신만고", 4], ["愼始敬終", "신시경종", 4], ["昏定晨省", "혼정신성", 4], ["尋人廣告", "심인 광고", 4], ["十匙一飯", "십시일반", 4]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 951–970 preserves graph identities', () => {
  for(const forms of [["幼兒", "幼芽"], ["亞聖", "牙城"], ["孤兒", "高雅"], ["紅顔", "鴻雁"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["萌芽", "萌", "maeng-200"], ["謁見", "見", "hyeon-200"], ["亞流", "流", "ryu-001"], ["龍顔", "龍", "yong-202"], ["押留", "留", "ryu-002"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["無我之境", "무아지경", 4], ["象牙塔", "상아탑", 3], ["沈魚落雁", "침어낙안", 4], ["亞鉛", "아연", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 971–990 preserves graph identities', () => {
  for(const forms of [["禪讓", "宣揚"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["般若", "若", "ya-200"], ["揭揚", "揭", "ge-200"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["意氣揚揚", "의기양양", 3], ["性相近也習相遠也", "성상근야습상원야", 6], ["殃及池魚", "앙급지어", 4], ["阿賴耶識", "아뢰야식", 4]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 991–1010 preserves graph identities', () => {
  for(const forms of [["糧食", "樣式"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["抑鬱", "鬱", "ul-200"], ["記憶力", "力", "ryeok-000"], ["追憶錄", "錄", "rok-101"], ["抑留", "留", "ryu-002"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["吾不關焉", "오불관언", 4], ["余那山", "여나산", 3], ["天壤之差", "천양지차", 4], ["億萬長者", "억만장자", 4]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1011–1030 preserves graph identities', () => {
  for(const forms of [["余等", "汝等"], ["余輩", "汝輩"], ["歷史", "役事", "驛舍"], ["煙氣", "延期"], ["鍊磨", "硏磨"], ["年度", "沿道"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["汝曹", "曹", "jo-202"], ["驛站", "站", "cham-200"], ["煤煙", "煤", "mae-201"], ["饗宴", "饗", "hyang-200"], ["蔓延", "蔓", "man-201"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["生殺予奪", "생살여탈", 4], ["辭受取予", "사수취여", 4], ["汝矣島", "여의도", 3]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1031–1050 preserves graph identities', () => {
  for(const forms of [["燃燒", "燕巢"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["燕雀", "雀", "jak-200"], ["燕巢", "巢", "so-202"], ["怡悅", "怡", "i-210"], ["欣悅", "欣", "heun-200"], ["撮影", "撮", "chwal-200"], ["影幀", "幀", "jeong-201"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["送舊迎新", "송구영신", 4], ["燕尾服", "연미복", 3], ["鉛活字", "연활자", 3]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1051–1070 preserves graph identities', () => {
  for(const forms of [["陰影", "吟詠"], ["映寫", "詠史"], ["吾人", "誤認"], ["悟悅", "嗚咽"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["頓悟", "頓", "don-200"], ["烏鵲", "鵲", "jak-201"], ["誤謬", "謬", "ryu-200"], ["驕傲", "驕", "gyo-200"], ["嗚咽", "咽", "yeol-203"], ["烏飛梨落", "梨", "i-207"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["嗚呼哀哉", "오호애재", 4], ["烏合之卒", "오합지졸", 4], ["名譽毁損", "명예훼손", 4], ["吾人", "오인", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1071–1090 preserves graph identities', () => {
  for(const forms of [["童謠", "動搖"], ["搖搖", "遙遙"], ["騷擾", "逍遙"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["搖籃", "籃", "ram-200"], ["腰椎", "椎", "chu-200"], ["腰肢", "肢", "ji-200"], ["逍遙", "逍", "so-203"], ["沐浴", "沐", "mok-200"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["曰可曰否", "왈가왈부", 3], ["曰可不可", "왈가불가", 3], ["遙遙", "요요", 1], ["後生可畏", "후생가외", 4], ["搖搖", "요요", 1]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1091–1110 preserves graph identities', () => {
  for(const forms of [["優先", "于先"], ["憂愁", "優秀", "偶數"], ["云謂", "云爲"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["遭遇", "遭", "jo-203"], ["雨傘", "傘", "san-201"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["日新又日新", "일신우일신", 3], ["減之又減", "감지우감", 3], ["右往左往", "우왕좌왕", 3], ["云云", "운운", 1]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1111–1130 preserves graph identities', () => {
  for(const forms of [["班員", "半圓"], ["疏遠", "訴願", "所願"], ["偉力", "威力"], ["侍衛", "示威"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["楕圓", "楕", "ta-200"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["圓周", "원주", 2], ["偉力", "위력", 2], ["威力", "위력", 2], ["大學院", "대학원", 3]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1131–1150 preserves graph identities', () => {
  for(const forms of [["僞善", "緯線"], ["僞裝", "胃腸"], ["有毒", "唯獨"], ["誘導", "柔道"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["圍繞", "繞", "yo-203"], ["委囑", "囑", "chok-201"], ["慰撫", "撫", "mu-200"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["唯我獨尊", "유아독존", 4], ["過猶不及", "과유불급", 4], ["困獸猶鬪", "곤수유투", 4], ["委員會", "위원회", 3]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1151–1170 preserves graph identities', () => {
  for(const forms of [["幼兒", "幼芽", "乳兒"], ["留學", "儒學"], ["猶子", "儒者"], ["柔軟", "悠然"], ["私有", "思惟", "四維"], ["唯一", "惟一"], ["有毒", "唯獨", "惟獨"], ["柳枝", "維持"], ["羊肉", "養育"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["纖維", "纖", "seom-200"], ["潤滑", "滑", "hwal-200"], ["隱匿", "匿", "nik-200"], ["呻吟", "呻", "sin-202"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["悠悠", "유유", 1], ["悠悠自適", "유유자적", 3], ["惟精惟一", "유정유일", 3], ["惟命是從", "유명시종", 4]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1171–1190 preserves graph identities', () => {
  for(const forms of [["意識", "儀式"], ["謝意", "事宜"], ["奇異", "旣已"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["儀仗", "仗", "jang-202"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["大矣哉", "대의재", 3], ["意義", "의의", 2], ["不得已", "부득이", 3], ["儀仗", "의장", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1191–1210 preserves graph identities', () => {
  for(const forms of [["以前", "移轉"], ["以後", "而後"], ["梨木", "耳目"], ["羽翼", "右翼"], ["因緣", "姻緣"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["耳鼻咽喉", "咽", "in-201"], ["耳鼻咽喉", "喉", "hu-200"], ["夷狄", "狄", "jeok-202"], ["攘夷", "攘", "yang-206"], ["嗚咽", "咽", "yeol-203"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["耳鼻咽喉", "이비인후", 4], ["而已", "이이", 2], ["婚姻申告", "혼인신고", 4], ["仁政", "인정", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1211–1230 preserves graph identities', () => {
  for(const forms of [["自負", "姊夫"], ["諷刺", "風姿"], ["茲今", "資金"], ["子爵", "自酌"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["諷刺", "諷", "pung-201"], ["紫水晶", "晶", "jeong-202"], ["斟酌", "斟", "jim-200"], ["殘骸", "骸", "hae-200"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["念茲在茲", "염자재자", 3], ["紫水晶", "자수정", 3], ["恣意的", "자의적", 3]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1231–1250 preserves graph identities', () => {
  for(const forms of [["暫行", "潛行"], ["帳簿", "丈夫"], ["障壁", "墻壁"], ["褒奬", "包裝"], ["首長", "手掌"], ["分掌", "扮粧"], ["化粧", "火葬"], ["濃粧", "農莊"], ["小腸", "所藏"], ["伸張", "腎臟"], ["長逝", "藏書"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["褒奬", "褒", "po-206"], ["掌握", "握", "ak-202"], ["扮粧", "扮", "bun-201"], ["腎臟", "腎", "sin-203"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["大丈夫", "대장부", 3], ["化粧品", "화장품", 3], ["墻壁", "장벽", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1251–1270 preserves graph identities', () => {
  for(const forms of [["秀才", "水災"], ["再逢", "裁縫"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["盆栽", "盆", "bun-202"], ["宰輔", "輔", "bo-200"], ["屠宰", "屠", "do-202"], ["裁縫", "縫", "bong-201"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["抵抗力", "저항력", 3], ["宰輔", "재보", 2], ["裁縫", "재봉", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1271–1290 preserves graph identities', () => {
  for(const forms of [["古跡", "孤寂"], ["寂寥", "摘要"], ["轉載", "錢財"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["寂寞", "寞", "mak-201"], ["寂寥", "寥", "yo-204"], ["硯滴", "硯", "yeon-208"], ["紡績", "紡", "bang-200"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["赤血球", "적혈구", 3], ["硯滴", "연적", 2], ["寂寥", "적요", 2], ["摘要", "적요", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1291–1310 preserves graph identities', () => {
  for(const forms of [["是正", "市井"], ["井田", "停電"], ["碇泊", "停泊"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["剽竊", "剽", "pyo-200"], ["店鋪", "鋪", "po-207"], ["井底之蛙", "蛙", "wa-200"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["井底之蛙", "정저지와", 4], ["胡蝶夢", "호접몽", 3], ["丁丑", "정축", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1311–1330 preserves graph identities', () => {
  for(const forms of [["井水", "淨水"], ["停止", "靜止"], ["正常", "頂上"], ["山頂", "山亭"], ["修正", "水亭", "修訂"], ["朝廷", "調整"], ["法庭", "法廷"], ["公正", "工程"], ["改正", "改訂"], ["校庭", "校正", "矯正", "校訂"], ["帝國", "諸國"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of []) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["頂上會談", "정상회담", 4], ["水亭", "수정", 2], ["修訂", "수정", 2], ["諸國", "제국", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1331–1350 preserves graph identities', () => {
  for(const forms of [["第一", "齊一"], ["鳥類", "潮流"], ["調査", "弔辭", "照射"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["堤堰", "堰", "eon-200"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["濟世安民", "제세안민", 4], ["防潮堤", "방조제", 3], ["鳥類", "조류", 2], ["潮流", "조류", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1351–1370 preserves graph identities', () => {
  for(const forms of [["前兆", "田租"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of []) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["再組合", "재조합", 3], ["補佐官", "보좌관", 3], ["縱橫", "종횡", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1371–1390 preserves graph identities', () => {
  for(const forms of [["週刊", "晝間"], ["注射", "朱砂"], ["註釋", "注釋"], ["住民", "州民"], ["圓周", "圓柱"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["歐洲", "歐", "gu-202"], ["舟艇", "艇", "jeong-203"], ["竹筍", "筍", "sun-201"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["晝耕夜讀", "주경야독", 4], ["同舟共濟", "동주공제", 4], ["一葉片舟", "일엽편주", 4], ["州知事", "주지사", 3]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1391–1410 preserves graph identities', () => {
  for(const forms of [["增訂", "贈呈"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["憎惡", "惡", "o-200"], ["蒸溜", "溜", "ryu-201"], ["贈呈", "呈", "jeong-204"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["蒸氣機關", "증기기관", 4], ["未曾有", "미증유", 3], ["只管打坐", "지관타좌", 4], ["憎惡", "증오", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1411–1430 preserves graph identities', () => {
  for(const forms of [["鎭靜", "陳情"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,word,count] of [["盡人事待天命", "진인사대천명", 6], ["遲遲不進", "지지부진", 3], ["鎭靜", "진정", 2], ["陳情", "진정", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1431–1450 preserves graph identities', () => {
  for(const forms of [["振動", "震動"], ["秩序", "姪壻"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["姪壻", "壻", "seo-204"], ["甥姪", "甥", "saeng-201"], ["痼疾", "痼", "go-200"], ["膺懲", "膺", "eung-200"], ["錯綜", "綜", "jong-200"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["姪壻", "질서", 2], ["秩序整然", "질서정연", 4], ["且信且疑", "차신차의", 3], ["捉虎甲士", "착호갑사", 4]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1451–1470 preserves graph identities', () => {
  for(const forms of [["昌達", "暢達"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["慘憺", "憺", "dam-201"], ["採掘", "掘", "gul-201"], ["叱責", "叱", "jil-201"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["昌達", "창달", 2], ["暢達", "창달", 2], ["同窓會", "동창회", 3], ["水彩畫", "수채화", 3]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1471–1490 preserves graph identities', () => {
  for(const forms of [["薦擧", "遷居"], ["千里", "踐履"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["湧泉", "湧", "yong-204"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["徹頭徹尾", "철두철미", 3], ["薦擧", "천거", 2], ["遷居", "천거", 2], ["晴雨計", "청우계", 3]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1491–1510 preserves graph identities', () => {
  for(const forms of [["市廳", "視聽"], ["軟體", "延滯"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,word,count] of [["不逮捕特權", "불체포특권", 5], ["風前燈燭", "풍전등촉", 4], ["交替選手", "교체선수", 4], ["抄錄", "초록", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1511–1530 preserves graph identities', () => {
  for(const forms of [["伸縮", "辛丑"], ["祝辭", "畜舍"], ["構築", "驅逐"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["抽籤", "籤", "cheom-200"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["抽象的", "추상적", 3], ["驅逐", "구축", 2], ["祝辭", "축사", 2], ["畜舍", "축사", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1531–1550 preserves graph identities', () => {
  for(const forms of [["數値", "羞恥"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["昆蟲", "昆", "gon-200"], ["趣旨", "旨", "ji-201"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["數値", "수치", 2], ["羞恥", "수치", 2], ["寄生蟲", "기생충", 3], ["吹奏樂", "취주악", 3]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1551–1570 preserves graph identities', () => {
  for(const forms of [["寢食", "浸蝕"], ["寢床", "枕上"], ["付託", "付托"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["浸漬", "漬", "ji-202"], ["穩妥", "穩", "on-200"], ["托鉢", "鉢", "bal-200"], ["濯纓", "纓", "yeong-206"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["寢食", "침식", 2], ["浸蝕", "침식", 2], ["高枕安眠", "고침안면", 4], ["濯纓", "탁영", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1571–1590 preserves graph identities', () => {
  for(const [hanja,glyph,id] of [["誕辰", "辰", "sin-204"], ["懶怠", "懶", "na-202"], ["倦怠", "倦", "gwon-200"], ["沼澤", "沼", "so-204"], ["嘔吐", "嘔", "gu-203"], ["吐瀉", "瀉", "sa-202"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["誕辰日", "탄신일", 3], ["思而不學則殆", "사이불학즉태", 6], ["國泰民安", "국태민안", 4], ["貪官汚吏", "탐관오리", 4]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1591–1610 preserves graph identities', () => {
  for(const [hanja,word,count] of [["無偏無頗", "무편무파", 3], ["播種機", "파종기", 3], ["把守兵", "파수병", 3]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1611–1630 preserves graph identities', () => {
  for(const [hanja,glyph,id] of [["敗北", "北", "bae-201"], ["貝塚", "塚", "chong-200"], ["編輯", "輯", "jip-200"], ["編纂", "纂", "chan-202"], ["幣帛", "帛", "baek-201"], ["廢墟", "墟", "heo-200"], ["遮蔽", "遮", "cha-203"], ["掩蔽", "掩", "eom-200"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["八角形", "팔각형", 3], ["抱腹絕倒", "포복절도", 4], ["貨幣價値", "화폐가치", 4]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1631–1650 preserves graph identities', () => {
  for(const [hanja,glyph,id] of [["金浦", "金", "gim-200"], ["僑胞", "僑", "gyo-201"], ["標識", "識", "ji-203"], ["豐饒", "饒", "yo-205"], ["皮膚", "膚", "bu-203"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["匹夫匹婦", "필부필부", 3], ["知彼知己", "지피지기", 3], ["被保險者", "피보험자", 4]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1651–1670 preserves graph identities', () => {
  for(const forms of [["滴下", "積荷"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["旱魃", "魃", "bal-201"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["鶴首苦待", "학수고대", 4], ["積荷", "적하", 2], ["耐旱性", "내한성", 3]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1671–1690 preserves graph identities', () => {
  for(const forms of [["恒久", "巷口", "港口"], ["解凍", "奚童"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["陷穽", "穽", "jeong-205"], ["閭巷", "閭", "yeo-202"], ["核融合", "融", "yung-201"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["港口", "항구", 2], ["巷口", "항구", 2], ["咸與維新", "함여유신", 4], ["不幸中多幸", "불행중다행", 4]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1691–1710 preserves graph identities', () => {
  for(const forms of [["鄕愁", "享受"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,word,count] of [["享受", "향수", 2], ["絃樂四重奏", "현악사중주", 5], ["懸垂幕", "현수막", 3]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1711–1730 preserves graph identities', () => {
  for(const forms of [["師兄", "死刑"], ["戶數", "湖水"], ["畿湖", "記號"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["亨嘉", "嘉", "ga-201"], ["穎慧", "穎", "yeong-207"], ["力拔山兮氣蓋世", "力", "yeok-202"], ["時不利兮騅不逝", "騅", "chu-201"], ["虞兮虞兮奈若何", "虞", "u-200"], ["不亦說乎", "說", "yeol-204"], ["湖畔", "畔", "ban-200"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["虞兮虞兮奈若何", "우혜우혜내약하", 5], ["時不利兮騅不逝", "시불리혜추불서", 6], ["不亦說乎", "불역열호", 4], ["湖水", "호수", 2], ["戶數", "호수", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1731–1750 preserves graph identities', () => {
  for(const [hanja,glyph,id] of [["毫釐", "釐", "ri-200"], ["浩瀚", "瀚", "han-200"], ["胡桃", "桃", "du-200"], ["離婚", "離", "i-211"], ["魂魄", "魄", "baek-202"], ["鴻鵠", "鵠", "gok-200"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["浩浩", "호호", 1], ["弘益人間", "홍익인간", 4], ["互助", "호조", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1751–1770 preserves graph identities', () => {
  for(const [hanja,glyph,id] of [["皇后", "后", "hu-201"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["禾本科植物", "화본과식물", 5], ["災禍", "재화", 2], ["通貨", "통화", 2]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1771–1790 preserves graph identities', () => {
  for(const forms of [["回顧", "懷古"]]) {
    for(const hanja of forms) {
      const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
      assert.equal(layout.edges.filter(edge=>edge.current).length,1);
      assert.equal(layout.edges.find(edge=>edge.current).word.hanja,hanja);
      for(const other of forms.filter(form=>form!==hanja)) {
        const candidate=words.find(word=>word.hanja===other);
        assert.equal(layout.edges.some(edge=>edge.word.hanja===other),candidate.components.some(glyph=>selected.components.includes(glyph)));
      }
    }
  }
  for(const [hanja,glyph,id] of [["荒蕪地", "蕪", "mu-201"], ["橫暴", "暴", "po-208"], ["毁謗", "謗", "bang-201"], ["輝煌", "煌", "hwang-203"], ["輝煌燦爛", "燦", "chan-203"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["後悔", "후회", 2], ["曉星", "효성", 2], ["揮發", "휘발", 2], ["輝煌燦爛", "휘황찬란", 4]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('vocabulary expansion 1791–1800 preserves graph identities', () => {
  for(const [hanja,glyph,id] of [["胸襟", "襟", "geum-200"]]) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id));
  }
  for(const [hanja,word,count] of [["携帶電話", "휴대전화", 4], ["胸襟", "흉금", 2], ["稀少性", "희소성", 3]]) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected), edge=layout.edges.find(item=>item.current);
    assert.equal(edge.word.word,word);
    assert.equal(edge.glyphs.length,count);
    assert.deepEqual(edge.word.components,selected.components);
  }
});


test('fixed supplemental vocabulary keeps homographs distinct in shared neighborhoods', () => {
  for(const [word, forms] of [
    ['기적', ['汽笛', '奇蹟']],
    ['포장', ['包裝', '鋪裝']],
    ['함정', ['陷穽', '艦艇']],
  ]) {
    const matches=words.filter(item=>item.word===word);
    for(const hanja of forms) {
      const selected=matches.find(item=>item.hanja===hanja);
      assert(selected, `${word} ${hanja} must remain independently selectable`);
      const graph=neighborhood(selected), layout=layoutNetwork(graph,selected);
      assert.deepEqual(layout.edges.filter(edge=>edge.current).map(edge=>[edge.word.word,edge.word.hanja]), [[word,hanja]]);
      assert.deepEqual(layout.edges.map(edge=>JSON.stringify([edge.word.word,edge.word.hanja])).sort(), graph.words.map(item=>JSON.stringify([item.word,item.hanja])).sort());
    }
  }
});

test('supplemental readings and repeated characters remain available after the collection cutoff', () => {
  for(const [word,hanja,glyph,sound] of [
    ['인후', '咽喉', '咽', 'in'],
    ['익명', '匿名', '匿', 'ik'],
    ['골계', '滑稽', '滑', 'gol'],
    ['봉랍', '封蠟', '蠟', 'rap'],
    ['납촉', '蠟燭', '蠟', 'nap'],
    ['이정', '釐正', '釐', 'i'],
  ]) {
    const selected=words.find(item=>item.word===word && item.hanja===hanja);
    const layout=layoutNetwork(neighborhood(selected),selected);
    assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id.startsWith(`${sound}-`)));
  }
  for(const hanja of ['煌煌','燦燦']) {
    const selected=words.find(item=>item.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    const edge=layout.edges.find(item=>item.current);
    assert.equal(edge.glyphs.length,1);
    assert.equal(edge.word.components.length,2);
    assert.equal(edgePaths(edge,layout.nodes).length,2);
  }
});
