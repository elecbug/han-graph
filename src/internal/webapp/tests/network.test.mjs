import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {layoutNetwork, edgePaths, renderNetworkSVG} from '../static/network.mjs';
import {segmentHitsBox} from '../static/network-routing.mjs';

const read=name=>fs.readFileSync(new URL(`../../../../dataset/${name}`,import.meta.url),'utf8').trim().split('\n').map(JSON.parse);
const words=read('normal_word.jsonl'), characters=read('character.jsonl');
function neighborhood(selected) {
  const roots=[...new Set(selected.components)];
  const connected=words.filter(word=>word.components.some(glyph=>roots.includes(glyph)));
  const glyphs=[...new Set([...roots,...connected.flatMap(word=>word.components)])];
  return {roots,words:connected,characters:glyphs.map(hanja=>({hanja,readings:characters.filter(c=>c.hanja===hanja)}))};
}

test('all direct neighbors are laid out once, with a clickable edge per word', () => {
  const selected=words.find(word=>word.hanja==='感覺');
  const network=neighborhood(selected), layout=layoutNetwork(network,selected);
  assert.equal(layout.nodes.length,26);
  assert.equal(layout.edges.length,20);
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
  assert(!layout.nodes.some(node=>node.hanja==='輕'), 'do not expand from 侮 to 경모');
  assert(!layout.edges.some(edge=>edge.word.hanja==='侮辱'||edge.word.hanja==='侮蔑'), 'only words containing a selected root belong in the neighborhood');
  assert(layout.nodes.some(node=>node.hanja==='敏'), 'include 민감');
  for(const glyph of ['銳','機'])assert(!layout.nodes.some(node=>node.hanja===glyph), 'do not expand from 敏 to 예민 or 기민');
  assert.deepEqual(layout,layoutNetwork(network,selected), 'layout must be deterministic');
});

test('long compounds, duplicate readings, homographs and repeated glyphs retain identity', () => {
  for(const hanja of ['勇敢無雙','降伏','各各','康健','句句節節','兔死狗烹','龜裂','菊花茶','陸軍','旅券','阿鼻叫喚','跆拳道','糾正','規定','僅僅','僅僅扶持','千斤萬斤','極端','劇團','勤勉','僅免','禽獸','錦繡','利己','樂器','其間','期間','猜忌','時期','幾何級數','豈弟','許諾','難易度','娘娘','那落','奈落','女子','年度','寧日','喜怒哀樂','惱殺','泥土','綠茶','茶道','怒發大發','但書','端緖','但書條項','但願桑麻成','剛斷','講壇','端正','斷定','短期','檀紀','文壇','文段','弄談','濃淡','正當','政黨','唐代','當代','冷淡','雪糖','砂糖','淡淡','堂堂','檀君神話','檀君朝鮮','荒唐無稽','地圖','指導','圖章','塗裝','矯導','敎徒','連帶','列島','挑戰狀','殺到','單刀直入','周到綿密','武陵桃源','待接','接待','首都','水稻','顚倒','前途','獨自','讀者','冬至','同志','共同','空洞','朗讀','洞察','洞窟','陸稻','督促狀','水稻作','稻熱病','陶瓷器','養豚場','同時','童詩','凍傷','銅像','段落','短絡','産卵','散亂','漏斗','羅列','網羅','娛樂','樂園','樂觀','落下','下落','卵子','亂離','欄干','空欄','鈍感','北斗七星','森羅萬象','冷凍庫','連絡處','廣告欄','蘭草','春蘭','東洋蘭','濫用','氾濫','浪費','風浪','郞君','新郞','花郞','花郞徒','畫廊','廊下','來日','掠奪','擄掠','掠奪品','省略','略圖','兩分','涼風','淸涼感','良心','棟梁','梁木','梁上君子','糧食','食糧','軍糧米','諒解','海諒','諒解覺書','念慮','旅行','奬勵金','奬勵','壯麗','考慮','高麗','連帶','聯隊','歷史','履歷','曆法','陽曆','月曆','練習','練習帳','憐憫','同病相憐','戀愛','失戀','聯合','聯合軍','蓮根','鍛鍊','鍊磨','製鍊','精鍊','列車','劣等','優劣','分裂','決裂','裂傷','廉價','破廉恥','狩獵','獵銃','命令','領收證','大統領','分水嶺','峻嶺','大關嶺','嶺東','零點','零細','靈魂','英靈','例外','慣例','冠禮','禮節','失禮','奴隸','隷書','隷屬國','隷屬民','勞動','勤勞','努力','勞力','老人','長老','露出','暴露','白露','鎔鑛爐','電氣爐','香爐','綠陰','新綠','祿俸','俸祿','官祿','目錄','鹿茸','鹿角','逐鹿','指鹿爲馬','論理','討論','戲弄','嘲弄','弄奸','信賴','無賴漢','依賴人','依賴書','雷雨','落雷','避雷針','材料','料金','完了','終了','修了','滿了','未完了','同僚愛','官僚制','龍宮','靑龍','登龍門','屢次','屢屢','屢代','樓臺','樓亭','望樓','淚腺','淚液','落淚','漏泄','累積','連累','累卵','楊柳','柳葉','柳枝','柳暗花明','蒲柳之質','留學','分類','六面體','六何原則','大陸','倫理','人倫','倫理學','年輪','輪廓','輪廻','車輪','法律','規律','旋律','韻律','生栗','栗卵','乾栗','比率','確率','效率','統率','輕率','隆盛','興隆','隆陵','王陵','利益','利子','李花','桃李','李下不整冠','李氏','李花紋','鄕里','里長','千里','萬里','鄕吏','胥吏','吏胥','吏房','履行','履歷書','履修','如履薄氷','梨花','梨園','梨汁','梨木','梨花酒','表裏','裏面','表裏不同','暗暗裏','近鄰','鄰接','鄰近','善鄰','鄰國','森林','山林','林業','林野','竹林','臨時','臨迫','臨席','君臨','降臨','磨耗','磨滅','切磋琢磨','磨製石器','麻痺','麻醉','麻布','莫大','莫強','莫論','莫逆','開幕','閉幕','字幕','內幕','沙漠','漠漠','漠然','廣漠','沙漠化','晚年','晚秋','晚餐','晚學','大器晚成','滿足','滿員','充滿','萬物','萬事','倨慢','傲慢','怠慢','緩慢','慢性','漫畫','散漫','漫談','天眞爛漫','週末','月末','年末','死亡','滅亡','亡命','多忙','奔忙','忙中閑','公私多忙','忙中','健忘症','忘年之交','忘恩','備忘錄','妄言','妄動','妄想','虛妄','輕擧妄動','罔極','罔測','欺君罔上','罔極之恩','茫茫','茫然','茫漠','蒼茫','茫然自失','姊妹','男妹','妹夫','妹弟','兄弟姊妹','每日','每週','每月','每年','每番','買收','買入','購買','買賣','買占','賣店','販賣','埋藏','埋葬','埋沒','埋設','埋立','媒體','仲媒','媒介體','觸媒','梅花','梅實','靑梅','紅梅','雪中梅','麥酒','小麥','大麥','麥芽','麥芽糖','脈搏','血脈','山脈','人脈','孟子','孟母','孟春','孟夏','孟母三遷之敎','猛獸','同盟','盟約','加盟','盟誓','盲人','文盲','盲點','盲目','盲信','免除','免許','免疫','勉學','勉學熱','睡眠','不眠','熟眠','不眠症','綿密','綿花','綿織物','綿絲','消滅','姓名','本名','名稱','生命','運命','共鳴','悲鳴','耳鳴','鳴禽','冥想','冥福','冥界','冥府','幽冥','座右銘','銘文','感銘','碑銘','墓誌銘','日暮','暮年','暮春','朝三暮四','朝令暮改','毛髮','羊毛','脫毛','毛織物','侮辱','輕侮','侮蔑','侮辱感','侮蔑感','冒險','冒險家','冒險心','冒險談','冒瀆','募集','募金','應募','公募','募兵','追慕','欽慕','思慕','敬慕','某氏','某處','某年','某月','某日','模型','模範','模倣','模擬','共謀','陰謀','謀議','謀略','圖謀','外貌','容貌','全貌','變貌','面貌','目的','目標','注目','牧場','牧畜','牧草','遊牧','放牧','和睦','親睦','親睦會','不睦','沒收','沒落','日沒','惡夢','吉夢','解夢','夢想','夢遊病','蒙昧','蒙恩','童蒙','蒙昧無知','卯時','乙卯','丁卯','己卯','奇妙','微妙','妙案','絕妙','墓地','省墓','墓碑','陵墓','宗廟','文廟','祠廟','廟堂','孔廟','苗木','育苗','種苗','苗床','苗圃','業務','事務','義務','任務','戊子','戊辰','戊寅','戊申','戊戌','武術','武力','武裝','舞踊','群舞','獨舞','茂盛','茂林','茂才','繁茂','茂林修竹','貿易','貿易商','貿易港','貿易業','自由貿易','濃霧','煙霧','噴霧','雲霧','霧散','水墨','水墨畫','墨香','墨色','筆墨','沈默','默念','默認','質問','疑問','訪問','新聞','所聞','見聞','傳聞','正門','入門','專門','勿論','勿驚','勿忘','勿忘草','勿失好機','意味','趣味','別味','風味','尾行','末尾','魚尾','未熟','白米','玄米','米穀','米飮','美術','美人','微細','微弱','眉間','白眉','蛾眉','眉目','焦眉之急','迷路','迷信','迷兒','昏迷','迷惑','國民','市民','住民','憫惘','憫然','憫恤','惻憫','敏感','銳敏','機敏','英敏','明敏','秘密','蜜月','蜜蠟','蜜源','蜜腺','糖蜜','素朴','淳朴','質朴','敦朴','朴氏','博士','博學','該博','拍手','拍子','拍動','拍車','拍手喝采','宿泊','碇泊','外泊','一泊','薄氷','稀薄','輕薄','壓迫','脅迫','切迫','折半','上半期','下半期','反應','反省','飯饌','朝飯','白飯','飯酒','茶飯事','同伴','同伴者','伴侶','伴奏','背叛','叛逆','叛軍','謀叛','班長','班員','分班','兩班','首班','音盤','圓盤','骨盤','一般','一般的','全般','諸般','萬般','返還','返送','返納','返戾','返品','拔萃','拔擢','選拔','白髮','頭髮','長髮','理髮','廚房','工房','放送','方向','方法','地方','探訪','來訪','禮訪','訪問客','豫防','防禦','防止','防火','模倣品','模倣作','模倣者','模倣心','傍觀','傍聽','傍證','傍系','傍點','妨害','妨害物','妨害者','妨害電波','無妨','芳香','芳香劑','芳名錄','芳年','芳草','友邦','異邦','異邦人','萬邦','敬拜','禮拜','參拜','拜禮','歲拜','乾杯','祝杯','聖杯','苦杯','優勝杯','倍數','倍加','倍增','倍率','倍額','栽培','培養','培養液','培養土','栽培法','排出','排列','排除','排水','排泄','背後','違背','背水陣','先輩','後輩','同輩','年輩','輩出','配達','配分','配置','配偶者','百年','百姓','百貨店','伯父','伯母','伯仲','伯爵','畫伯','番號','順番','當番','番地','煩雜','煩多','煩悶','繁盛','繁榮','繁殖','飜譯','飜覆','飜案','飜譯家','飜譯文','伐木','征伐','討伐','伐採','處罰','刑罰','罰金','罰則','天罰','平凡','非凡','凡人','凡常','凡例','犯罪','犯人','共犯','再犯','侵犯','範圍','壁面','壁畫','障壁','絕壁','外壁','碧空','碧海','碧眼','碧波','桑田碧海','丙子','病者','報道','步道','報告','寶庫','普及','補給','祈福','起伏','刺繡屛風','竝列','普及率','樂譜','年譜','辨證法','詭辯','富者','父子','富裕','浮游','卜筮','封套','鳳凰','鳳凰紋','鳳凰圖','奉養','扶養','占卜','卜占','夫婦','扶養家族','連峯','龍鳳','腹部','最高峯','蜂群','覆面']) {
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
    for(const [word,glyph] of [['豈弟','豈'],['許諾','諾'],['難易度','易'],['娘娘','娘'],['奈落','奈'],['女子','女'],['年度','年'],['寧日','寧'],['喜怒哀樂','怒'],['惱殺','殺'],['泥土','泥'],['綠茶','綠'],['茶道','茶'],['弄談','弄'],['冷淡','冷'],['雪糖','糖'],['砂糖','糖'],['連帶','連'],['列島','列'],['挑戰狀','狀'],['殺到','殺'],['朗讀','朗'],['洞察','洞'],['洞窟','洞'],['陸稻','陸'],['督促狀','狀'],['漏斗','漏'],['羅列','羅'],['網羅','羅'],['落下','落'],['下落','落'],['卵子','卵'],['産卵','卵'],['亂離','亂'],['散亂','亂'],['欄干','欄'],['空欄','欄'],['蘭草','蘭'],['濫用','濫'],['浪費','浪'],['郞君','郞'],['花郞','郞'],['畫廊','廊'],['廊下','廊'],['來日','來'],['掠奪','掠'],['擄掠','掠'],['省略','省'],['略圖','略'],['兩分','兩'],['涼風','涼'],['淸涼感','涼'],['良心','良'],['棟梁','梁'],['梁木','梁'],['糧食','糧'],['食糧','糧'],['諒解','諒'],['海諒','諒'],['念慮','念'],['歷史','歷'],['履歷','履'],['曆法','曆'],['陽曆','曆'],['練習','練'],['憐憫','憐'],['戀愛','戀'],['聯合','聯'],['蓮根','蓮'],['鍛鍊','鍊'],['鍊磨','鍊'],['列車','列'],['劣等','劣'],['優劣','劣'],['分裂','裂'],['決裂','裂'],['裂傷','裂'],['廉價','廉'],['破廉恥','廉'],['狩獵','獵'],['獵銃','獵'],['命令','令'],['領收證','領'],['大統領','領'],['分水嶺','嶺'],['嶺東','嶺'],['零點','零'],['靈魂','靈'],['英靈','靈'],['例外','例'],['慣例','例'],['禮節','禮'],['失禮','禮'],['隷書','隷'],['勞動','勞'],['勤勞','勞'],['老人','老'],['長老','老'],['露出','露'],['暴露','露'],['白露','露'],['祿俸','祿'],['俸祿','祿'],['目錄','錄'],['鹿茸','鹿'],['逐鹿','鹿'],['指鹿爲馬','鹿'],['論理','論'],['討論','論'],['雷雨','雷'],['落雷','雷'],['材料','料'],['料金','料'],['龍宮','龍'],['靑龍','龍'],['登龍門','龍'],['屢次','屢'],['屢屢','屢'],['屢代','屢'],['樓臺','樓'],['樓亭','樓'],['望樓','樓'],['淚腺','淚'],['淚液','淚'],['落淚','淚'],['累積','累'],['連累','累'],['累卵','累'],['楊柳','柳'],['柳葉','柳'],['柳暗花明','柳'],['蒲柳之質','柳'],['留學','留'],['六面體','六'],['六何原則','六'],['倫理','倫'],['人倫','倫'],['年輪','輪'],['輪廓','輪'],['輪廻','輪'],['法律','律'],['規律','律'],['旋律','律'],['韻律','律'],['生栗','栗'],['栗卵','栗'],['乾栗','栗'],['隆盛','隆'],['興隆','隆'],['隆陵','隆'],['利益','利'],['李花','李'],['桃李','李'],['李氏','李'],['李下不整冠','李'],['鄕里','里'],['里長','里'],['鄕吏','吏'],['胥吏','吏'],['吏胥','吏'],['履行','履'],['如履薄氷','履'],['梨花','梨'],['梨汁','梨'],['表裏','裏'],['裏面','裏'],['近鄰','鄰'],['鄰接','鄰'],['森林','林'],['林業','林'],['臨時','臨'],['君臨','臨'],['天眞爛漫','爛'],['年末','年'],['每年','年'],['忘年之交','年'],['備忘錄','錄'],['麥芽糖','糖'],['盟誓','誓'],['朝令暮改','令'],['陵墓','陵'],['王陵','陵'],['隆陵','陵'],['省墓','省'],['沒落','落'],['謀略','略'],['某年','年'],['不睦','不'],['茂林','林'],['茂林修竹','林'],['貿易','易'],['貿易商','易'],['貿易港','易'],['貿易業','易'],['自由貿易','易'],['默念','念'],['勿論','論'],['迷路','路'],['糖蜜','糖'],['拍車','車'],['切迫','切'],['反省','省'],['茶飯事','茶'],['兩班','兩'],['理髮','理'],['論理','理'],['來訪','來'],['禮訪','禮'],['禮拜','禮'],['拜禮','禮'],['芳名錄','錄'],['芳年','年'],['排列','列'],['年輩','年'],['百年','年'],['凡例','例'],['竝列','列'],['年譜','年'],['連峯','連'],['龍鳳','龍']]) {
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
    if(['各各','僅僅','娘娘','淡淡','堂堂','屢屢','漠漠','茫茫'].includes(hanja)) {
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
    for(const [word,glyph,id] of [['卜筮','筮','seo-202'],['封套','套','tu-200'],['鳳凰','凰','hwang-202'],['浮游','游','yu-203']]) {
      if(hanja===word)assert(layout.nodes.find(node=>node.hanja===glyph).readings.some(reading=>reading.id===id), 'new component readings must be available in the graph');
    }
    if(hanja==='刺繡屛風')assert.equal(edge.word.word,'자수 병풍');
    if(hanja==='但書條項') {
      assert.equal(edge.word.word,'단서 조항');
      assert.equal(edge.glyphs.length,4);
    }
    if(['單刀直入','周到綿密','武陵桃源','北斗七星','森羅萬象','梁上君子','諒解覺書','同病相憐','指鹿爲馬','柳暗花明','蒲柳之質','六何原則','如履薄氷','表裏不同','切磋琢磨','磨製石器','大器晚成','天眞爛漫','公私多忙','忘年之交','輕擧妄動','欺君罔上','罔極之恩','茫然自失','兄弟姊妹','朝三暮四','朝令暮改','蒙昧無知','茂林修竹','自由貿易','勿失好機','妨害電波','桑田碧海','刺繡屛風','扶養家族'].includes(hanja))assert.equal(edge.glyphs.length,4);
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
    if(['水稻作','稻熱病','陶瓷器','養豚場','督促狀','冷凍庫','連絡處','廣告欄','東洋蘭','花郞徒','掠奪品','淸涼感','軍糧米','奬勵金','練習帳','聯合軍','破廉恥','領收證','大統領','分水嶺','大關嶺','隷屬國','隷屬民','鎔鑛爐','電氣爐','無賴漢','依賴人','依賴書','避雷針','未完了','同僚愛','官僚制','登龍門','六面體','倫理學','李花紋','履歷書','梨花酒','沙漠化','忙中閑','健忘症','備忘錄','媒介體','雪中梅','麥芽糖','勉學熱','不眠症','綿織物','座右銘','墓誌銘','毛織物','侮辱感','侮蔑感','冒險家','冒險心','冒險談','親睦會','夢遊病','貿易商','貿易港','貿易業','水墨畫','勿忘草'].includes(hanja))assert.equal(edge.glyphs.length,3);
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
    for(const forms of [['輕侮','敬慕'],['公募','共謀'],['模擬','謀議'],['己卯','奇妙'],['宗廟','種苗'],['戊戌','武術'],['傳聞','專門'],['丙子','病者'],['報告','寶庫'],['普及','補給'],['祈福','起伏'],['富者','父子'],['富裕','浮游']]) {
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
