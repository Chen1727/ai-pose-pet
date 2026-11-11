import { Link } from '@tanstack/react-router'
import { ArrowRightIcon, DogIcon, HeartHandshakeIcon, LayoutGridIcon, PawPrintIcon, ShirtIcon, UserRoundIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import type { PetCategory, PetImage } from '@/types/pet'

export function GalleryOverview({ images, onSelect, costumeCount = 0, portraitCount = 0 }: {
  images: PetImage[]
  onSelect: (image: PetImage) => void
  costumeCount?: number
  portraitCount?: number
}) {
  const counts = useMemo(() => ({
    breeds: images.filter((image) => image.kind === 'breed').length,
    poses: images.filter((image) => image.kind === 'pose').length,
    costumes: images.filter((image) => image.category === 'pet_costume').length,
    interaction: images.filter((image) => image.category === 'interaction').length,
  }), [images])
  const allCount = images.length + costumeCount + portraitCount
  const recommendations = useMemo(() => {
    const recent = [...images].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    const picks: PetImage[] = []
    const categories: PetCategory[] = ['cat', 'dog', 'pet_costume', 'interaction']
    for (const category of categories) {
      const image = recent.find((item) => item.category === category && !picks.some((pick) => pick.original === item.original))
      if (image) picks.push(image)
    }
    for (const image of recent) {
      if (picks.length === 4) break
      if (!picks.some((pick) => pick.original === image.original)) picks.push(image)
    }
    return picks
  }, [images])

  return <>
    <section className="overview-stats" aria-label="图库数量统计">
      <div className="overview-stat">
        <span className="overview-stat-icon"><LayoutGridIcon className="size-5" /></span>
        <div><strong>{allCount.toLocaleString('zh-CN')}</strong><small>全部图库</small></div>
      </div>
      <div className="overview-stat">
        <span className="overview-stat-icon"><PawPrintIcon className="size-5" /></span>
        <div><strong>{counts.breeds.toLocaleString('zh-CN')}</strong><small>猫狗种类</small></div>
      </div>
      <div className="overview-stat">
        <span className="overview-stat-icon"><DogIcon className="size-5" /></span>
        <div><strong>{counts.poses.toLocaleString('zh-CN')}</strong><small>宠物姿势</small></div>
      </div>
      <div className="overview-stat">
        <span className="overview-stat-icon"><ShirtIcon className="size-5" /></span>
        <div><strong>{counts.costumes.toLocaleString('zh-CN')}</strong><small>宠物服装</small></div>
      </div>
      <div className="overview-stat">
        <span className="overview-stat-icon"><HeartHandshakeIcon className="size-5" /></span>
        <div><strong>{counts.interaction.toLocaleString('zh-CN')}</strong><small>人宠互动</small></div>
      </div>
      <div className="overview-stat">
        <span className="overview-stat-icon"><ShirtIcon className="size-5" /></span>
        <div><strong>{costumeCount.toLocaleString('zh-CN')}</strong><small>服装穿搭</small></div>
      </div>
      <div className="overview-stat">
        <span className="overview-stat-icon"><UserRoundIcon className="size-5" /></span>
        <div><strong>{portraitCount.toLocaleString('zh-CN')}</strong><small>人像颜值</small></div>
      </div>
    </section>
    {recommendations.length > 0 && <section className="recommendation-strip" aria-labelledby="recommendation-title">
      <div className="recommendation-heading">
        <div>
          <span className="section-kicker">FIND YOUR INSPIRATION</span>
          <h2 id="recommendation-title">推荐参考图</h2>
          <p>从猫狗种类、宠物姿势、宠物服装和人宠互动中寻找下一份灵感。</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/pet-breeds">进入猫狗种类库 <ArrowRightIcon className="size-3.5" /></Link>
        </Button>
      </div>
      <div className="recommendation-grid">
        {recommendations.map((image, index) => <button key={image.id} type="button" className="recommendation-card" onClick={() => onSelect(image)}>
          <span className="recommendation-cover">
            <img src={image.thumbnail} alt={image.title} loading="lazy" />
            <span className="recommendation-number">0{index + 1}</span>
          </span>
          <span className="recommendation-caption">
            <strong>{image.title}</strong>
            <small>{image.label} · {image.type}</small>
          </span>
        </button>)}
      </div>
    </section>}
  </>
}
