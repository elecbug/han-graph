#!/usr/bin/env python3
"""Generate local Uzbek/Kyrgyz translations, applying and checking 10 records at a time.

Requires CTranslate2 and SentencePiece only for this maintenance command. The
application uses the saved JSON fields and needs neither library nor model.
"""
import argparse
import html
import json
from pathlib import Path
import re
import signal
import time

from localized_dataset import apply_batch, check_all, check_row, identity, read_rows

CODES = {'uz': 'uzn_Latn', 'ky': 'kir_Cyrl'}
TERMS = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff\U00020000-\U000323af]+(?:\[[가-힣]+\])?|[가-힣]+')
READINGS = re.compile(r'([\u3400-\u4dbf\u4e00-\u9fff\U00020000-\U000323af])\[([가-힣]+)\]')


def source_text(text):
    for _ in range(3):
        text = html.unescape(text)
    text = re.sub(r'>\s*>', '»', re.sub(r'<\s*<', '«', text))
    return text.translate(str.maketrans({'«':'"','»':'"','“':'"','”':'"','‘':"'",'’':"'",'–':'-','—':'-','…':'...','\u00a0':' '}))


def broken_translation(text):
    return any(token in text for token in ('<unk>', '⁇', '\ufffd')) or bool(re.search(r'&(?:amp;|#)', text))

# Context-sensitive senses checked against the Korean entry, not a bridge-language
# homonym (e.g. 將 is a military commander, 堰 is a dam).
CHARACTER_REVIEW = {
    'gyeong-001': (['anʼanaviy taqvimdagi yettinchi osmon belgisi'], ['салттуу жылнаамадагы жетинчи асман белгиси']),
    'gwi-000': (['qaytmoq', 'tegishli boʻlmoq', 'turmushga chiqmoq'], ['кайтуу', 'таандык болуу', 'турмушка чыгуу']),
    'deok-000': (['ezgulik', 'axloqiy fazilat'], ['адептүүлүк', 'адеп-ахлактык сапат']),
    'deung-002': (['teng', 'daraja'], ['бирдей', 'даража']),
    'eon-200': (['toʻgʻon'], ['дамба; суу тосмосу']),
    'yeom-100': (['boʻyamoq', 'dogʻ tushirmoq'], ['боёо', 'так түшүрүү']),
    'wi-107': (['aytmoq', 'atamoq'], ['айтуу', 'атоо']),
    'jang-002': (['kelajakda', 'lashkarboshi'], ['келечекте', 'кол башчы']),
    'jae-100': (['vazir', 'boshqarmoq', 'mol soʻymoq'], ['вазир', 'башкаруу', 'мал союу']),
    'ta-201': (['soʻlak'], ['шилекей']),
    'tak-102': (['loyqa', 'nopok'], ['ылай', 'таза эмес']),
    'ho-103': (['varvar'], ['варвар']),
    'bong-100': (['muhrlamoq', 'bermoq', 'toʻsib qoʻymoq', 'tuproq uymoq'], ['мөөр басуу', 'ыйгаруу', 'тосуп коюу', 'топурак үйүү']),
}

WORD_REVIEW = {
    'dictionary': ('lugʻat', 'сөздүк'),
    'a tree nursery': ('koʻchatzor', 'көчөт өстүрүүчү жай'),
    'perfect-attendance award': ('biror darsni qoldirmaganlik uchun mukofot', 'сабакты калтырбагандыгы үчүн сыйлык'),
    'health, physical and mental well-being': ('sogʻliq, jismoniy va ruhiy farovonlik', 'ден соолук, дененин жана психиканын жакшы абалы'),
    'sheet music; musical score': ('notalar; partitura', 'ноталар; партитура'),
    'being struck with astonishment': ('hayratdan lol qolish', 'таң калуудан нес болуу'),
    'adverb': ('ravish', 'тактооч'),
    'tripod': ('uchoyoqli taglik', 'үч буттуу таяныч'),
    'May': ('may', 'май'), 'Purple.': ('binafsha rang', 'кызгылт көк түс'),
    'larva': ('lichinka', 'личинка'), 'novella': ('qissa', 'повесть'),
    'alveolus': ('alveola', 'альвеола'),
    'empress dowager': ('imperatorning onasi boʻlgan beva imperatritsa', 'императордун жесир калган энеси'),
    'larynx': ('hiqildoq', 'кекиртек'),
}

SENSE_REVIEW = {
    'armor': ('zirh', 'соот'), 'shell': ('qobiq', 'кабык'),
    'rabbit': ('quyon', 'коён'), 'tiger': ('yoʻlbars', 'жолборс'),
    'ox': ('hoʻkiz', 'өгүз'), 'pig': ('choʻchqa', 'чочко'),
    'rooster': ('xoʻroz', 'короз'), 'monkey': ('maymun', 'маймыл'),
    'horse': ('ot', 'ат'), 'dog': ('it', 'ит'), 'rat': ('kalamush', 'келемиш'),
    'sheep': ('qoʻy', 'кой'), 'goat': ('echki', 'эчки'), 'bird': ('qush', 'куш'),
    'fish': ('baliq', 'балык'), 'dragon': ('ajdarho', 'ажыдаар'),
    'saliva': ('soʻlak', 'шилекей'), 'muddy': ('loyqa', 'ылайлуу'),
    'weak': ('zaif', 'алсыз'), 'rich': ('boy', 'бай'), 'wealthy': ('badavlat', 'бай'),
    'abundant': ('moʻl', 'мол'), 'poverty': ('kambagʻallik', 'жакырчылык'),
    'clean': ('toza', 'таза'), 'dirty': ('kirli', 'кир'), 'pure': ('sof', 'таза'),
    'easy': ('oson', 'оңой'), 'early': ('erta', 'эрте'), 'late': ('kech', 'кеч'),
    'fast': ('tez', 'тез'), 'slow': ('sekin', 'жай'), 'deep': ('chuqur', 'терең'),
    'shallow': ('sayoz', 'тайыз'), 'cold': ('sovuq', 'суук'), 'hot': ('issiq', 'ысык'),
    'warm': ('iliq', 'жылуу'), 'high': ('baland', 'бийик'), 'low': ('past', 'төмөн'),
    'not yet': ('hali emas', 'али жок'),
    'universal': ('umumiy', 'жалпы'), 'token': ('belgi', 'белги'),
    'talisman': ('tumor', 'тумар'), 'aspen': ('togʻterak', 'көктерек'),
    'ballad': ('ballada', 'баллада'), 'anchor': ('langar', 'кеме казыгы'),
    'marten': ('suvsar', 'суусар'), 'fragment': ('parcha', 'үзүндү'),
    'linchpin': ('oʻqni mahkamlovchi shtift', 'окту бекитүүчү төөнөгүч'),
    'heavenly stem': ('anʼanaviy taqvimdagi osmon belgisi', 'салттуу жылнаамадагы асман белгиси'),
}
EXAMPLE_REVIEW = {
    '같은 물건이라도 가게마다 가격이 달라요.': (
        'Bir xil mahsulotning narxi ham doʻkonga qarab farq qiladi.',
        'Бир эле товардын баасы дүкөнгө жараша айырмаланат.'),
    '가정에서 서로의 이야기를 듣는 시간을 가지려고 해요.': (
        'Uyda bir-birimizning gapimizni tinglashga vaqt ajratishga harakat qilaman.',
        'Үйдө бири-бирибизди угууга убакыт бөлүүгө аракет кылам.'),
    '모든 조건이 같다는 가정 아래 두 실험을 비교했어요.': (
        'Barcha sharoitlar bir xil degan faraz asosida ikki tajribani taqqosladim.',
        'Бардык шарттар бирдей деген божомол менен эки тажрыйбаны салыштырдым.'),
    '주말에는 가족과 함께 저녁을 먹어요.': (
        'Dam olish kunlari oilam bilan kechki ovqatni birga yeyman.',
        'Дем алыш күндөрү үй-бүлөм менен бирге кечки тамак ичем.'),
    '동아리에서는 개인의 의견도 빠짐없이 들으려고 해요.': (
        'Toʻgarakda har bir kishining fikrini eʼtiborsiz qoldirmay tinglashga harakat qilamiz.',
        'Ийримде ар бир адамдын пикирин калтырбай угууга аракет кылабыз.'),
    '도서관에서 친구와 함께 한국어를 공부했어요.': (
        'Kutubxonada doʻstim bilan koreys tilini oʻrgandim.',
        'Китепканада досум менен корей тилин үйрөндүм.'),
    '박물관에서는 어린이를 위한 역사 교육을 진행해요.': (
        'Muzeyda bolalar uchun tarix darslari oʻtkaziladi.',
        'Музейде балдарга тарых боюнча билим берилет.'),
    '여행 중에 본 것과 느낀 것을 기록으로 남겼어요.': (
        'Sayohatda koʻrganlarim va his qilganlarimni yozib qoldirdim.',
        'Сапарда көргөндөрүмдү жана сезимдеримди жазып калтырдым.'),
    '서로에 대한 신뢰는 협력의 기초가 돼요.': (
        'Bir-biriga ishonch hamkorlikning asosidir.',
        'Бири-бирине болгон ишеним кызматташуунун негизи болот.'),
    '사전에서 모르는 단어의 뜻을 찾아보았어요.': (
        'Lugʻatdan bilmagan soʻzimning maʼnosini izladim.',
        'Билбеген сөзүмдүн маанисин сөздүктөн издедим.'),
    '사전에서 단어의 뜻과 쓰임을 함께 확인했어요.': (
        'Lugʻatdan soʻzning maʼnosi va qoʻllanishini birga tekshirdim.',
        'Сөздүктөн сөздүн маанисин жана колдонулушун чогуу карадым.'),
    '오늘 수업에서는 한국어로 길을 묻는 연습을 했어요.': (
        'Bugungi darsda koreys tilida yoʻl soʻrashni mashq qildik.',
        'Бүгүнкү сабакта корей тилинде жол суроону машыктык.'),
    '서로 다른 언어를 배우며 문화를 이해해요.': (
        'Turli tillarni oʻrganib, madaniyatlarni tushunamiz.',
        'Ар түрдүү тилдерди үйрөнүп, маданияттарды түшүнөбүз.'),
    '오랜만에 만난 친구와 밤늦도록 이야기를 나누었어요.': (
        'Anchadan beri koʻrmagan doʻstim bilan kech tungacha suhbatlashdik.',
        'Көптөн бери көрүшпөгөн досум менен түн бир оокумга чейин сүйлөштүм.'),
    '집에서 학교까지 걸어서 다녀요.': (
        'Uydan maktabgacha piyoda qatnayman.',
        'Үйдөн мектепке жөө барып келем.'),
    '학생들은 모둠을 이루어 발표 자료를 만들었어요.': (
        'Oʻquvchilar guruhlar tuzib, taqdimot materiallarini tayyorlashdi.',
        'Окуучулар топторго бөлүнүп, баяндама үчүн материал даярдашты.'),
    '지도를 보며 한국의 위치를 살펴보았어요.': (
        'Xaritadan Janubiy Koreyaning qayerda joylashganini koʻrdim.',
        'Картадан Түштүк Кореянын жайгашкан жерин карадым.'),
    '소설 속 인물은 가랄한 태도로 묘사되어 있어요.': (
        'Romandagi qahramon nihoyatda qoʻpol va shafqatsiz qilib tasvirlangan.',
        'Романдагы каарман өтө катаал жана ырайымсыз болуп сүрөттөлөт.'),
    '그 기술은 환경 문제를 해결할 대안으로 각광을 받고 있어요.': (
        'Bu texnologiya ekologik muammolarni hal qilishning muqobil usuli sifatida eʼtibor qozonmoqda.',
        'Бул технология экологиялык көйгөйлөрдү чечүүнүн башка жолу катары көңүл чордонунда турат.'),
    '소설 속 인물은 간악한 태도로 주변 사람들을 대했어요.': (
        'Romandagi qahramon atrofidagilarga makkorlik va yovuzlik bilan munosabatda boʻldi.',
        'Романдагы каарман айланасындагыларга амалкөйлүк жана кара ниеттик менен мамиле кылган.'),
    '오래 걸은 뒤 물을 마시니 갈증이 가셨어요.': (
        'Uzoq yurganimdan keyin suv ichib chanqogʻimni qondirdim.',
        'Узак баскандан кийин суу ичип, суусунумду кандырдым.'),
    '전문가는 작은 차이를 살펴 대상을 감별했어요.': (
        'Mutaxassis kichik farqlarni oʻrganib, buyumni ajratib oldi.',
        'Адис кичинекей айырмачылыктарды карап, буюмду айырмалап тааныды.'),
    '방문객들은 전시된 작품을 조용히 감상했어요.': (
        'Tashrifchilar koʻrgazmadagi asarlarni jimgina tomosha qilishdi.',
        'Көрүүчүлөр көргөзмөдөгү чыгармаларды унчукпай карап турушту.'),
    '꾸준한 연습을 통해 강단을 기르려고 해요.': (
        'Muntazam mashq qilib, qatʼiyatimni oshirishga harakat qilyapman.',
        'Туруктуу машыгуу аркылуу чечкиндүүлүктү өрчүтүүгө аракет кылып жатам.'),
    '이야기에 등장하는 개선장군의 행동을 살펴보았어요.': (
        'Hikoyadagi gʻalaba bilan qaytgan sarkardaning harakatlarini oʻrganib chiqdim.',
        'Аңгемедеги жеңиш менен кайтып келген кол башчынын аракеттерин изилдедим.'),
    '새로운 정보에 맞추어 기록을 갱신했어요.': (
        'Yangi maʼlumotga moslab qaydlarimni yangiladim.',
        'Жазууларымды жаңы маалыматка ылайык жаңырттым.'),
    '역사책은 나라의 건국 과정부터 설명하고 있어요.': (
        'Tarix kitobi avval mamlakatning tashkil topish jarayonini tushuntiradi.',
        'Тарых китеби алгач өлкөнүн түптөлүү жараянын түшүндүрөт.'),
    '검색어를 구체적으로 입력하면 원하는 정보를 찾기 쉬워요.': (
        'Aniq qidiruv soʻzini kiritsangiz, kerakli maʼlumotni topish oson boʻladi.',
        'Так издөө сөзүн киргизсеңиз, керектүү маалыматты табуу оңой болот.'),
    '소설 속 인물은 겁약한 태도로 묘사되어 있어요.': (
        'Romandagi qahramon tortinchoq sifatida tasvirlangan.',
        'Романдагы каарман тартынчаак катары сүрөттөлөт.'),
}
_english_ordinals = 'first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth'.split()
_uzbek_ordinals = 'birinchi ikkinchi uchinchi toʻrtinchi beshinchi oltinchi yettinchi sakkizinchi toʻqqizinchi oʻninchi oʻn_birinchi oʻn_ikkinchi'.split()
_kyrgyz_ordinals = 'биринчи экинчи үчүнчү төртүнчү бешинчи алтынчы жетинчи сегизинчи тогузунчу онунчу он_биринчи он_экинчи'.split()
for index, ordinal in enumerate(_english_ordinals):
    for kind, uz_term, ky_term in [('heavenly stem', 'osmon belgisi', 'асман белгиси'), ('earthly branch', 'yer belgisi', 'жер белгиси')]:
        if kind == 'heavenly stem' and index >= 10:
            continue
        uz_ordinal = _uzbek_ordinals[index].replace('_', ' ')
        ky_ordinal = _kyrgyz_ordinals[index].replace('_', ' ')
        SENSE_REVIEW[f'{ordinal} {kind}'] = (f'anʼanaviy taqvimdagi {uz_ordinal} {uz_term}', f'салттуу жылнаамадагы {ky_ordinal} {ky_term}')


PRACTICE_REVIEW = {
    'alias': {
        'prompt_uz': 'Yozuvchi haqiqiy ismini oshkor qilmay, kitobini boshqa ism bilan nashr etdi. Bunday ism nima deb ataladi?',
        'prompt_ky': 'Жазуучу чыныгы атын айтпай, китебин башка ат менен чыгарды. Мындай ат кандай аталат?',
        'explanation_uz': '假[가] soxtalik yoki shartli narsani, 名[명] esa ismni bildiradi. 가명 — taxallus, yaʼni haqiqiy ism oʻrniga ishlatiladigan ism. Ishora — yozuvchi haqiqiy ismini oshkor qilmagan.',
        'explanation_ky': '假[가] жасалма же шарттуу нерсеге байланыштуу, ал эми 名[명] «ат» дегенди билдирет. 가명 — чыныгы аттын ордуна колдонулган жасалма ат, башкача айтканда, псевдоним. Белги — жазуучу чыныгы атын ачык айткан эмес.',
    },
    'price': {
        'prompt_uz': 'Doʻkonda bir kishi koʻylakni koʻrsatib: «Bu qancha turadi?» deb soʻradi. U nimani bilmoqchi?',
        'prompt_ky': 'Дүкөндө бирөө көйнөктү көрсөтүп: «Бул канча турат?» — деп сурады. Ал эмнени билгиси келет?',
        'explanation_uz': '價[가] qiymat yoki narxni anglatadi. 가격 buyumni sotib olish uchun toʻlanadigan pulni, 가치 esa uning qadr-qiymati yoki ahamiyatini bildiradi. «Qancha turadi?» savoli 가격 soʻziga ishora qiladi.',
        'explanation_ky': '價[가] нарк же баа менен байланыштуу. 가격 — буюм үчүн төлөнгөн акча, ал эми 가치 анын баалуулугун же маанилүүлүгүн билдирет. «Канча турат?» деген суроо 가격 сөзүнө ишарат кылат.',
    },
    'permission': {
        'prompt_uz': 'Sinf xonasidan foydalanishga oʻqituvchingizdan ruxsat soʻradingiz. Oʻqituvchi rozi boʻldi. Siz nima oldingiz?',
        'prompt_ky': 'Мугалимден классты колдонууга уруксат сурадыңыз. Мугалим макул болду. Сиз эмне алдыңыз?',
        'explanation_uz': '許[허] va 可[가] ruxsat berish maʼnosiga ega. 허가 — ruxsat. 가능 biror narsaning mumkinligi yoki uni qila olishni anglatadi. Bu vaziyatda ruxsat olingan, shuning uchun 허가 mos keladi.',
        'explanation_ky': '許[허] жана 可[가] уруксат берүүгө байланышкан маанилерди билдирет. 허가 — уруксат. 가능 мүмкүнчүлүктү же бир нерсени кыла алууну билдирет. Бул жагдайда уруксат алынгандыктан, 허가 туура келет.',
    },
    'acceleration': {
        'prompt_uz': 'Avtomobil yoʻlga chiqqach, tezligini tobora oshiryapti. Tezlikdagi bu oʻzgarishni qaysi soʻz ifodalaydi?',
        'prompt_ky': 'Унаа жолго чыккандан кийин ылдамдыгын улам көбөйтүп жатат. Ылдамдыктын бул өзгөрүшүн кайсы сөз билдирет?',
        'explanation_uz': '加[가] qoʻshish yoki oshirishni, 速[속] esa tezlikni bildiradi. Tezlikning ortishi 가속 deyiladi. 가산 soʻzida ham 加[가] bor, lekin 算[산] hisob-kitob bilan bogʻliq.',
        'explanation_ky': '加[가] кошууну же көбөйтүүнү, ал эми 速[속] ылдамдыкты билдирет. Ылдамдыктын өсүшү 가속 деп аталат. 가산 сөзүндө да 加[가] бар, бирок 算[산] эсептөөгө байланыштуу.',
    },
}


class DraftTranslator:
    def __init__(self, model, cache_path):
        import ctranslate2
        import sentencepiece
        self.tokenizer = sentencepiece.SentencePieceProcessor(model_file=str(model / 'sentencepiece.bpe.model'))
        self.model = ctranslate2.Translator(str(model), compute_type='int8', intra_threads=6, inter_threads=4)
        self.path = cache_path
        self.cache = {}
        if cache_path.exists():
            for line in cache_path.read_text().splitlines():
                row = json.loads(line)
                key = (row['language'], row.get('source_language','rus_Cyrl'), row['source'])
                if not broken_translation(row['text']):
                    self.cache[key] = row['text']
                else:
                    self.cache.pop(key, None)
        # Reviewed dictionary forms. Russian senses already distinguish homonyms.
        glossary = {
            'предполагать': ('taxmin qilmoq', 'болжолдоо'),
            'ценность; стоимость': ('qadr-qiymat; narx', 'баалуулук; нарк'),
            'песня': ('qoʻshiq', 'ыр'), 'петь': ('kuylamoq', 'ырдоо'),
            'улицы': ('koʻcha', 'көчө'), 'проспект': ('shohkoʻcha', 'проспект'),
            'рама; каркас': ('rom; karkas', 'алкак; каркас'),
            'подставка; стойка': ('taglik; tokcha', 'таяныч; текче'),
            'возводить': ('barpo etmoq', 'куруу'),
            'свободное время': ('boʻsh vaqt', 'бош убакыт'),
            'правильный': ('toʻgʻri', 'туура'), 'возможный': ('mumkin boʻlgan', 'мүмкүн болгон'),
            'поражение': ('magʻlubiyat', 'жеңилүү'),
            'проигрывать': ('yutqazmoq', 'утулуу'), 'флейта': ('nay', 'чоор'),
            'скала; камень': ('qoya; tosh', 'аска; таш'),
            'утёс; обрыв': ('qoya; jarlik', 'аска; жар'),
            'сеянец; росток': ('koʻchat; nihol', 'көчөт; бүчүр'),
            'ноты; партитура': ('notalar; partitura', 'ноталар; партитура'),
            'цена': ('narx', 'баа'), 'стоимость': ('qiymat', 'нарк'),
            'вода': ('suv', 'суу'), 'огонь': ('olov', 'от'), 'дерево': ('daraxt', 'дарак'),
            'золото': ('oltin', 'алтын'), 'земля': ('yer', 'жер'), 'небо': ('osmon', 'асман'),
            'человек': ('inson', 'адам'), 'люди': ('odamlar', 'адамдар'),
            'красивый': ('chiroyli', 'сулуу'), 'хороший': ('yaxshi', 'жакшы'),
            'ложный': ('yolgʻon', 'жалган'), 'временный': ('vaqtinchalik', 'убактылуу'),
            'дом': ('uy', 'үй'), 'семья': ('oila', 'үй-бүлө'), 'школа': ('maktab', 'мектеп'),
            'имя': ('ism', 'ат'), 'число': ('son', 'сан'), 'цвет': ('rang', 'түс'),
            'делить': ('boʻlmoq', 'бөлүү'), 'сверкать': ('chaqnamoq', 'жаркылдоо'),
            'свет': ('yorugʻlik', 'жарык'), 'лёгкий': ('yengil', 'жеңил'),
            'характер': ('feʼl-atvor', 'мүнөз'), 'иероглиф': ('iyeroglif', 'иероглиф'),
            'письменный знак': ('yozuv belgisi', 'жазуу белгиси'),
            'интерес': ('qiziqish', 'кызыгуу'), 'родник': ('buloq', 'булак'),
            'колодец': ('quduq', 'кудук'), 'берег': ('qirgʻoq', 'жээк'),
            'вид': ('tur', 'түр'), 'право': ('huquq', 'укук'), 'власть': ('hokimiyat', 'бийлик'),
            'сила': ('kuch', 'күч'), 'приказ': ('buyruq', 'буйрук'), 'письмо': ('xat', 'кат'),
            'линейка': ('chizgʻich', 'сызгыч'), 'секунда': ('soniya', 'секунда'),
            'солнце': ('quyosh', 'күн'), 'луна': ('oy', 'ай'), 'звезда': ('yulduz', 'жылдыз'),
            'гора': ('togʻ', 'тоо'), 'река': ('daryo', 'дарыя'), 'море': ('dengiz', 'деңиз'),
            'дождь': ('yomgʻir', 'жамгыр'), 'снег': ('qor', 'кар'), 'ветер': ('shamol', 'шамал'),
            'камень': ('tosh', 'таш'), 'сердце': ('yurak', 'жүрөк'), 'тело': ('tana', 'дене'),
            'рука': ('qoʻl', 'кол'), 'глаз': ('koʻz', 'көз'), 'ухо': ('quloq', 'кулак'),
            'голова': ('bosh', 'баш'), 'рот': ('ogʻiz', 'ооз'), 'день': ('kun', 'күн'),
            'месяц': ('oy', 'ай'), 'год': ('yil', 'жыл'), 'время': ('vaqt', 'убакыт'),
            'слово': ('soʻz', 'сөз'), 'книга': ('kitob', 'китеп'), 'тетрадь': ('daftar', 'дептер'),
            'пот': ('ter', 'тер'), 'молодой побег': ('yosh nihol', 'жаш бүчүр'),
            'восток': ('sharq', 'чыгыш'), 'запад': ('gʻarb', 'батыш'),
            'север': ('shimol', 'түндүк'), 'юг': ('janub', 'түштүк'),
            'белый': ('oq', 'ак'), 'чёрный': ('qora', 'кара'), 'красный': ('qizil', 'кызыл'),
            'синий': ('koʻk', 'көк'), 'зелёный': ('yashil', 'жашыл'), 'жёлтый': ('sariq', 'сары'),
        }
        for (language, source_language, source), value in list(self.cache.items()):
            if language == "uz":
                self.cache[language, source_language, source] = re.sub(r"([oOgG])\s*[ʻʼ‘’'`´]\s*", r"\1ʻ", value)
        self.reviewed = set(glossary)
        for source, targets in glossary.items():
            for language, translated in zip(('uz', 'ky'), targets):
                self.cache[language, 'rus_Cyrl', source] = translated
        for source, targets in {**SENSE_REVIEW, **WORD_REVIEW}.items():
            for language, translated in zip(('uz', 'ky'), targets):
                self.cache[language, 'eng_Latn', source] = translated

    def remember(self, language, source, translated, source_language="rus_Cyrl"):
        self.cache[language, source_language, source] = translated
        with self.path.open('a') as output:
            output.write(json.dumps({'language': language, 'source_language': source_language, 'source': source, 'text': translated}, ensure_ascii=False) + '\n')

    def translate(self, requests, source_language="rus_Cyrl"):
        pending = list(dict.fromkeys((lang, text) for lang, text in requests if (lang, source_language, text) not in self.cache))
        simple, tokens, prefixes, protected = [], [], [], []
        for language, source in pending:
            # Keep dictionary headword labels outside the translation model.
            label = re.match(r'^([가-힣]+):\s*(.+)$', source)
            if label:
                self.translate([(language, label.group(2))], source_language)
                self.remember(language, source, label.group(1) + ': ' + self.cache[language, source_language, label.group(2)], source_language)
                continue
            parts = []
            def replace(match):
                marker = str(98700 + len(parts)); parts.append((marker, match.group()))
                return marker
            prepared = TERMS.sub(replace, source_text(source))
            simple.append((language, source)); protected.append(parts)
            tokens.append(self.tokenizer.encode(prepared, out_type=str) + ['</s>', source_language])
            prefixes.append([CODES[language]])
        if not tokens:
            return
        outputs = self.model.translate_batch(tokens, target_prefix=prefixes, beam_size=4, max_batch_size=5, max_decoding_length=512)
        for (language, source), parts, result in zip(simple, protected, outputs):
            translated = self.tokenizer.decode(result.hypotheses[0][1:]).strip()
            lost = False
            for marker, literal in parts:
                translated = re.sub(r'(?<!\d)' + r'[\s,.-]*'.join(marker) + r'(?!\d)', marker, translated)
                if marker not in translated:
                    lost = True
                    break
                translated = translated.replace(marker, literal)
            if lost:
                # Short prose fragments avoid losing teaching terms to paraphrases.
                fragments = []
                position = 0
                clean_source = source_text(source)
                for match in TERMS.finditer(clean_source):
                    fragments.extend([(False, clean_source[position:match.start()]), (True, match.group())])
                    position = match.end()
                fragments.append((False, clean_source[position:]))
                prose = [part.strip() for keep, part in fragments if not keep and re.search(r'[A-Za-zА-Яа-яЁё]', part)]
                self.translate([(language, text) for text in prose], source_language)
                translated = ' '.join(part if keep or not re.search(r'[A-Za-zА-Яа-яЁё]', part) else self.cache[language, source_language, part.strip()] for keep, part in fragments)
            translated = re.sub(r'\s+', ' ', translated).strip()
            if language == 'uz':
                translated = re.sub(r"([oOgG])\s*[ʻʼ‘’'`´]\s*", r'\1ʻ', translated)
            if broken_translation(translated):
                retry = source_text(source).replace('"', '').strip()
                if retry != source:
                    self.translate([(language, retry)], source_language)
                    translated = self.cache[language, source_language, retry]
            if broken_translation(translated) or not translated:
                raise ValueError(f'Empty/unknown {language} translation: {source!r} => {translated!r}')
            self.remember(language, source, translated, source_language)

    def sentences(self, language, text):
        parts = re.split(r'(?<=[.!?;])\s+', text)
        self.translate([(language, part) for part in parts])
        return ' '.join(self.cache[language, "rus_Cyrl", part] for part in parts)


def word_updates(row, languages, translator, characters):
    updates = {}
    for language in languages:
        code, source = ('rus_Cyrl', row['meaning_ru']) if row['meaning_ru'] in translator.reviewed else ('eng_Latn', row['meaning_en'])
        meaning = translator.cache.get((language, code, source))
        updates[f'meaning_{language}'] = meaning
        if not meaning or not row.get('semantic_hint'):
            continue
        references = list(dict.fromkeys(READINGS.findall(row['semantic_hint'])))
        if not references:
            spelling = list(re.sub(r'\s', '', row['word']))
            references = [(glyph, spelling[i] if i < len(spelling) else '') for i, glyph in enumerate(row['hanja']) if TERMS.fullmatch(glyph) and not ('가' <= glyph <= '힣')]
        details = []
        for glyph, sound in references:
            reading = characters.get((glyph, sound), characters.get((glyph, '')))
            label = f'{glyph}[{sound}]' if sound else glyph
            details.append(label + ' — ' + ', '.join(reading[f'meaning_{language}']) if reading else label)
        heading = 'Iyerogliflar va ularning maʼnolari: ' if language == 'uz' else 'Иероглифтердин маанилери: '
        ending = f'«{row["word"]}» ({row["hanja"]}) soʻzining maʼnosi: ' if language == 'uz' else f'«{row["word"]}» ({row["hanja"]}) сөзүнүн мааниси: '
        updates[f'semantic_hint_{language}'] = heading + '; '.join(details).rstrip('.') + '. ' + ending + meaning.rstrip('.') + '.'
    return updates


def character_updates(row, languages, translator):
    updates = {}
    for language in languages:
        index = ('uz', 'ky').index(language)
        if row['id'] in CHARACTER_REVIEW:
            values = CHARACTER_REVIEW[row['id']][index]
        elif len(row['meaning_en']) == len(row['meaning_ru']):
            values = [SENSE_REVIEW[en.lower()][index] if en.lower() in SENSE_REVIEW else translator.cache.get((language, 'rus_Cyrl', ru)) for en, ru in zip(row['meaning_en'], row['meaning_ru'])]
        else:
            values = [translator.cache.get((language, 'rus_Cyrl', ru)) for ru in row['meaning_ru']]
        updates[f'meaning_{language}'] = list(dict.fromkeys(values))
    return updates


def main():
    def interrupted(_signum, _frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupted)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', type=Path, default=Path(__file__).resolve().parents[1] / 'dataset')
    parser.add_argument('--languages', nargs='+', choices=CODES, default=['uz', 'ky'])
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--validator', type=Path, required=True)
    parser.add_argument('--work-dir', type=Path, required=True)
    parser.add_argument('--limit-records', type=int)
    parser.add_argument('--rewrite-characters', action='store_true')
    parser.add_argument('--rewrite-words', action='store_true')
    args = parser.parse_args()
    args.work_dir.mkdir(parents=True, exist_ok=True)
    translator = DraftTranslator(args.model, args.work_dir / 'drafts.jsonl')
    groups = {row['id']: row for row in read_rows(args.dataset / 'meta.jsonl')}
    characters = {}
    total = 0; started = time.monotonic()
    with (args.work_dir / 'batches.jsonl').open('a') as log:
        for filename in ['character.jsonl', 'word.jsonl', 'example.jsonl', 'practice.json']:
            if filename == 'word.jsonl':
                for row in read_rows(args.dataset / 'character.jsonl'):
                    sound = groups[row['id'].rsplit('-', 1)[0]]['sound_ko']
                    characters[row['hanja'], sound] = row
                    characters.setdefault((row['hanja'], ''), row)
            rows = read_rows(args.dataset / filename)
            pending = []
            for row in rows:
                try:
                    if (args.rewrite_characters and filename == 'character.jsonl') or (args.rewrite_words and filename == 'word.jsonl'):
                        raise ValueError('Rewrite draft dictionary forms')
                    check_row(filename, row, args.languages)
                    if filename == 'character.jsonl':
                        if any(row.get(key) != value for key, value in character_updates(row, args.languages, translator).items()):
                            raise ValueError('Refresh the reviewed character sense')
                    if filename == 'word.jsonl':
                        if any(row.get(key) != value for key, value in word_updates(row, args.languages, translator, characters).items()):
                            raise ValueError('Refresh from the primary definition')
                    if filename == 'example.jsonl' and row['example_ko'] in EXAMPLE_REVIEW:
                        if any(row.get(f'example_{lang}') != EXAMPLE_REVIEW[row['example_ko']][('uz','ky').index(lang)] for lang in args.languages):
                            raise ValueError('Refresh the reviewed example')
                    if filename == 'practice.json' and row['id'] in PRACTICE_REVIEW:
                        if any(row.get(key) != value for key, value in PRACTICE_REVIEW[row['id']].items() if key.rsplit('_', 1)[1] in args.languages):
                            raise ValueError('Refresh the reviewed practice translation')
                except ValueError:
                    pending.append(row)
            print(filename, 'pending', len(pending), flush=True)
            for offset in range(0, len(pending), 10):
                batch = pending[offset:offset + 10]
                if args.limit_records:
                    batch = batch[:max(0, args.limit_records - total)]
                if not batch:
                    return
                requests, english_requests = [], []
                for row in batch:
                    if (filename == 'character.jsonl' and row['id'] in CHARACTER_REVIEW) or (filename == 'example.jsonl' and row['example_ko'] in EXAMPLE_REVIEW) or (filename == 'practice.json' and row['id'] in PRACTICE_REVIEW):
                        continue
                    if filename == 'word.jsonl':
                        if row['meaning_ru'] not in translator.reviewed:
                            english_requests.extend((language,row['meaning_en']) for language in args.languages)
                    else:
                        sources = row['meaning_ru'] if filename == 'character.jsonl' else [row['example_ru']] if filename == 'example.jsonl' else [part for field in ('prompt_ru','explanation_ru') for part in re.split(r'(?<=[.!?;])\s+',row[field])]
                        requests.extend((language, text) for text in sources for language in args.languages)
                translator.translate(requests)
                translator.translate(english_requests, "eng_Latn")
                patches = []
                for row in batch:
                    updates = word_updates(row, args.languages, translator, characters) if filename == 'word.jsonl' else {}
                    for language in args.languages:
                        if filename == 'character.jsonl':
                            updates.update(character_updates(row, args.languages, translator))
                        elif filename == 'example.jsonl':
                            updates[f'example_{language}'] = EXAMPLE_REVIEW[row['example_ko']][('uz','ky').index(language)] if row['example_ko'] in EXAMPLE_REVIEW else translator.cache[language, 'rus_Cyrl', row['example_ru']]
                        elif filename == 'practice.json' and row['id'] in PRACTICE_REVIEW:
                            updates.update({key:value for key,value in PRACTICE_REVIEW[row['id']].items() if key.endswith('_' + language)})
                        elif filename == 'practice.json':
                            updates[f'prompt_{language}'] = translator.sentences(language, row['prompt_ru'])
                            updates[f'explanation_{language}'] = translator.sentences(language, row['explanation_ru'])
                    patches.append({'file': filename, 'key': identity(filename, row), 'updates': updates})
                apply_batch(args.dataset, patches, args.validator.resolve(), log, args.languages)
                total += len(batch)
                if offset % 100 == 0 or offset + len(batch) == len(pending):
                    print(filename, offset + len(batch), '/', len(pending), 'validated; total', total, 'seconds', round(time.monotonic() - started), flush=True)
    print('Complete:', check_all(args.dataset, args.languages), flush=True)


if __name__ == '__main__':
    main()
