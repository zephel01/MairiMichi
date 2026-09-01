import type {
  BenefitMajorId,
  ClusterBenefit,
  DeityCluster,
  BenefitMinorId,
} from '@/core/types'
import type { BenefitTaxonomy } from '@/core/derive'

/** テスト用の神格クラスタ（data/deity_clusters.yaml の抜粋） */
export const CLUSTERS: DeityCluster[] = [
  {
    id: 'hachiman',
    label: '八幡',
    religion: 'shinto',
    qids: ['Q261637', 'Q317997'],
    aliases: ['八幡神', '八幡大神', '誉田別命', '譽田別命', '応神天皇', '應神天皇'],
  },
  {
    id: 'inari',
    label: '稲荷',
    religion: 'shinto',
    qids: ['Q719665', 'Q3080728'],
    aliases: ['稲荷神', '稲荷大神', '宇迦之御魂神', 'ウカノミタマ', '倉稲魂命'],
  },
  {
    id: 'tenjin',
    label: '天神',
    religion: 'shinto',
    qids: ['Q1753428', 'Q382005'],
    aliases: ['菅原道真', '天満大自在天神', '天神'],
  },
  {
    id: 'susanoo',
    label: 'スサノオ',
    religion: 'shinto',
    qids: ['Q272993', 'Q11570247'],
    aliases: ['素戔嗚尊', '素盞鳴命', '須佐之男命', 'スサノオ', '牛頭天王'],
  },
  {
    id: 'amaterasu',
    label: '天照',
    religion: 'shinto',
    qids: ['Q455602'],
    aliases: ['天照大神', '天照大御神', '天照皇大神', 'アマテラス'],
  },
  {
    id: 'munakata',
    label: '宗像・市杵島',
    religion: 'shinto',
    qids: [],
    aliases: ['市杵島姫命', '市寸島比売命', 'イチキシマヒメ', '田心姫命', '湍津姫命'],
  },
  {
    id: 'kanayamahiko',
    label: '金山彦',
    religion: 'shinto',
    qids: [],
    aliases: ['金山彦命', '金山毘古命'],
  },
  {
    id: 'jinbutsu_shin',
    label: '人物神',
    religion: 'shinto',
    qids: [],
    aliases: ['織田信長', '徳川家康', '東照大権現', '豊臣秀吉', '源頼朝', '織田信忠'],
    benefitPolicy: 'NO_AUTO_MAPPING',
  },
  {
    id: 'amida',
    label: '阿弥陀如来',
    religion: 'buddhist',
    qids: [],
    aliases: ['阿弥陀如来', '阿弥陀仏'],
    benefitPolicy: 'NO_CURRENT_BENEFIT',
  },
  {
    id: 'yakushi',
    label: '薬師如来',
    religion: 'buddhist',
    qids: [],
    aliases: ['薬師如来', '薬師瑠璃光如来'],
  },
]

/** テスト用の クラスタ→御利益（data/cluster_benefits.yaml の抜粋） */
export const CLUSTER_BENEFITS: ClusterBenefit[] = [
  { cluster: 'inari', primary: ['shoubai_hanjou', 'gokoku_houjou'], secondary: ['kinun', 'kanai_anzen', 'byouki_heiyu', 'geinou_gigei'] },
  { cluster: 'hachiman', primary: ['yakuyoke_only', 'kaiun'], secondary: ['shoubu_un', 'koutsuu_anzen', 'enmusubi_love', 'kanai_anzen'] },
  { cluster: 'tenjin', primary: ['gakugyou_jouju', 'jyuken_goukaku'], secondary: ['shikaku_chie', 'geinou_gigei', 'yakuyoke_only'] },
  { cluster: 'susanoo', primary: ['yakuyoke_only'], secondary: ['gokoku_houjou', 'enmusubi_love', 'kenkou_chouju'] },
  { cluster: 'amaterasu', primary: ['kaiun'], secondary: ['gokoku_houjou', 'kinun', 'kanai_anzen'] },
  { cluster: 'munakata', primary: ['kaijou_anzen', 'koutsuu_anzen'], secondary: ['shoubai_hanjou', 'geinou_gigei'] },
  { cluster: 'kanayamahiko', primary: ['gokoku_houjou'], secondary: ['shoubai_hanjou'] },
  { cluster: 'yakushi', primary: ['byouki_heiyu'], secondary: ['kenkou_chouju', 'yakuyoke_only'] },
  { cluster: 'jinbutsu_shin', primary: [], secondary: [], policy: 'NO_AUTO_MAPPING' },
  { cluster: 'amida', primary: [], secondary: [], policy: 'NO_CURRENT_BENEFIT' },
]

export const CLUSTER_BENEFIT_MAP = new Map(
  CLUSTER_BENEFITS.map((c) => [c.cluster, c]),
)

/** テスト用のタクソノミ（data/benefits.yaml の抜粋） */
const MINOR_TO_MAJOR: Array<[BenefitMinorId, BenefitMajorId, string]> = [
  ['enmusubi_love', 'enmusubi', '縁結び'],
  ['shoubai_hanjou', 'shoubai', '商売繁盛'],
  ['kinun', 'shoubai', '金運・財運'],
  ['gakugyou_jouju', 'gakugyou', '学業成就'],
  ['jyuken_goukaku', 'gakugyou', '受験合格'],
  ['shikaku_chie', 'gakugyou', '資格・知恵'],
  ['byouki_heiyu', 'kenkou', '病気平癒'],
  ['kenkou_chouju', 'kenkou', '健康長寿'],
  ['yakuyoke_only', 'yakuyoke', '厄除け'],
  ['kaiun', 'yakuyoke', '開運・所願成就'],
  ['anzan_only', 'anzan', '安産'],
  ['koutsuu_anzen', 'koutsuu', '交通安全'],
  ['shoubu_un', 'shoubu', '勝負運'],
  ['kanai_anzen', 'kanai', '家内安全'],
  ['gokoku_houjou', 'nariwai', '五穀豊穣'],
  ['kaijou_anzen', 'nariwai', '海上安全・航海安全'],
  ['geinou_gigei', 'nariwai', '芸能・技芸上達'],
  ['hiyoke', 'nariwai', '火除け・防火'],
]

export const TAXONOMY: BenefitTaxonomy = {
  majorOf: new Map(MINOR_TO_MAJOR.map(([m, maj]) => [m, maj])),
  labelOf: new Map(MINOR_TO_MAJOR.map(([m, , l]) => [m, l])),
}

export const ALL_MAJORS: BenefitMajorId[] = [
  'enmusubi',
  'shoubai',
  'gakugyou',
  'kenkou',
  'yakuyoke',
  'anzan',
  'koutsuu',
  'shoubu',
  'kanai',
  'nariwai',
]
