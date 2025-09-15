import 'dotenv/config'
import { prisma } from './db'

async function main() {
  const count = await prisma.bankItem.count()
  if (count > 0) {
    console.log(`[seed] bank_items already exists: ${count}`)
    return
  }
  console.log('[seed] seeding minimal bank items...')
  const items = [
    // 数学: 一次関数（mcq 4 + free 2）
    ...Array.from({ length: 4 }).map((_, i) => ({
      subject: '数学', unit: '一次関数', tags: JSON.stringify(['一次関数','傾き','切片']), type: 'mcq',
      payload: {
        type: 'mcq',
        prompt: `直線 y=2x+${i} の傾きは？`,
        choices: ['1','2','-2','0'],
        answer: '2',
        explanation: 'y=ax+b で a が傾き。',
        difficulty: 1,
        objectives: ['傾きの理解']
      }
    })),
    ...Array.from({ length: 2 }).map((_, i) => ({
      subject: '数学', unit: '一次関数', tags: JSON.stringify(['交点']), type: 'free',
      payload: {
        type: 'free',
        prompt: `直線 y=3x-1 と y=x+${i} の交点を求めよ。`,
        answer: 'x=… , y=…',
        explanation: '連立で解く。',
        rubric: { maxPoints:5, criteria:[{name:'立式',points:2},{name:'計算',points:2},{name:'表記',points:1}]}
      }
    })),
    // 理科: 化学式
    ...Array.from({ length: 4 }).map((_, i) => ({
      subject: '理科', unit: '化学式', tags: JSON.stringify(['式量']), type: 'mcq',
      payload: {
        type: 'mcq',
        prompt: `水(H2O)の式量は？(H=1,O=16)`,
        choices: ['18','17','20','16'],
        answer: '18',
        explanation: '2*1 + 16 = 18',
        difficulty: 1
      }
    })),
    ...Array.from({ length: 2 }).map((_, i) => ({
      subject: '理科', unit: '化学式', tags: JSON.stringify(['係数合わせ']), type: 'free',
      payload: {
        type: 'free',
        prompt: `反応の係数を最簡にせよ: H2 + O2 → H2O`,
        answer: '2H2 + O2 → 2H2O',
        explanation: 'H 原子数をそろえる。',
        rubric: { maxPoints:5, criteria:[{name:'保存則',points:3},{name:'表記',points:2}]}
      }
    })),
    // 社会: 太平洋戦争
    ...Array.from({ length: 4 }).map((_, i) => ({
      subject: '社会', unit: '太平洋戦争', tags: JSON.stringify(['年表','出来事']), type: 'mcq',
      payload: {
        type: 'mcq',
        prompt: `真珠湾攻撃が行われたのは西暦何年？`,
        choices: ['1941','1939','1945','1942'],
        answer: '1941',
        explanation: '1941年12月。',
        difficulty: 1
      }
    })),
    ...Array.from({ length: 2 }).map((_, i) => ({
      subject: '社会', unit: '太平洋戦争', tags: JSON.stringify(['因果']), type: 'free',
      payload: {
        type: 'free',
        prompt: `ミッドウェー海戦の結果が戦局に与えた影響を80字で述べよ。`,
        answer: '日本の攻勢は後退し主導権が連合国側へ傾いた。',
        explanation: '空母喪失が転機。',
        rubric: { maxPoints:5, criteria:[{name:'事実',points:2},{name:'因果',points:2},{name:'表現',points:1}]}
      }
    })),
  ]

  for (const it of items) {
    await prisma.bankItem.create({ data: { ...it, payload: JSON.stringify((it as any).payload) } as any })
  }
  console.log('[seed] done')
}

main().catch((e)=>{ console.error(e); process.exit(1) }).finally(async ()=>{ await prisma.$disconnect() })
