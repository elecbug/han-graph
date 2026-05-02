# DB Scheme

데이터베이스 스키마 정의를 위한 구성입니다.

## HanText

프로그램에서 하나의 한자는 `HanText` 객체로 표현되며, 객체는 다음과 같은 요소들을 우선 포함합니다.

|Field Name|Type|Description|e.g.|
|-|-|-|-|
|han|char|한자 글자 그 자체|`"善"`|
|sound_ko|char[]|한국어 발음|`["선"]`|
|sound_zh|string[]|중국어 병음|`["shàn"]`|
|sound_ja|string[]|일본어 음독|`["ぜん"]`|
|meaning_ko|string[]|한국어 의미|`["착하다", "선하다"]`|
|meaning_en|string[]|영어 의미|`["good", "virtuous", "kind"]`|
|meaning_ru|string[]|러시아어 의미|`["добрый", "хороший"]`|
|edge|HanEdge[]|다른 한자로의 연결(단어의 형성)|이하 참조|
|extend|HanExtend|확장용 필드|이하 참조|

## HanEdge

프로그램에서 한자와 한자의 연결은 `HanEdge` 객체를 통해 이루어지며, 각 객체는 하나의 2음절 한자 단어가 됩니다. 각 객체는 다음과 같은 요소를 포함합니다.

|Field Name|Type|Description|e.g.|
|-|-|-|-|
|begin|HanText|단어의 시작 글자|`善`|
|end|HanText|단어의 끝 글자|`行`|
|meaning_ko|string[]|한국어 뜻 풀이|`["모범이 되는 착한 행동"]`|
|meaning_en|string[]|영어 뜻 풀이|`["a good deed"]`|
|meaning_ru|string[]|러시아어 뜻 풀이|`["доброе дело"]`|

## HanExtend

`HanText`에 객체에 대한 추가적인 정보를 기입하는 확장용 필드입니다.

|Field Name|Type|Description|e.g.|
|-|-|-|-|
|grade|enum|난이도|`중등 한자`|
|freq_rank|int|빈도 등급|`234` (전체 중 234번째로 자주 등장)|
|semantic_group|enum|의미 계통 표현|`도덕 \| 인성`|
|unicode|string|유니코드 문자열|`"U+5584"`|
|image_path|string|확대 이미지 경로|`"img/5584.png"`|

## 기타

- 두 개의 다른 동음이의어는 서로 다른 객체와 그 조합으로 구성됩니다.
  - 예를들어, 선행(a good deed, 善行)과 선행(preceding, 先行)은 총 3개의 `HanText` 객체와 2개의 `HanEdge` 객체로 구성됩니다.
