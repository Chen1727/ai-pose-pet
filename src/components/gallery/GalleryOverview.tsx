import { Link } from '@tanstack/react-router'
import { ArrowRightIcon, DogIcon, HeartHandshakeIcon, PawPrintIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import type { PetCategory, PetImage } from '@/types/pet'

export function GalleryOverview({ images, onSelect }: {
  images: PetImage[]
  onSelect: (image: PetImage) => void
}) {
  const counts = useMemo(() => ({
    cat: images.filter((image) => image.category === 'cat').length,
    dog: images.filter((image) => image.category === 'dog').length,
    interaction: images.filter((image) => image.category === 'interaction').length,
  }), [images])
  const recommendations = useMemo(() => {
    const recent = [...images].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    const picks: PetImage[] = []
    const categories: PetCategory[] = ['cat', 'dog', 'interaction']
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
        <span className="overview-stat-icon"><PawPrintIcon className="size-5" /></span>
        <div><strong>{counts.cat.toLocaleString('zh-CN')}</strong><small>猫咪参考</small></div>
      </div>
      <div className="overview-stat">
        <span className="overview-stat-icon"><DogIcon className="size-5" /></span>
        <div><strong>{counts.dog.toLocaleString('zh-CN')}</strong><small>狗狗参考</small></div>
      </div>
      <div className="overview-stat">
        <span className="overview-stat-icon"><HeartHandshakeIcon className="size-5" /></span>
        <div><strong>{counts.interaction.toLocaleString('zh-CN')}</strong><small>人宠互动</small></div>
      </div>
    </section>
    {recommendations.length > 0 && <section className="recommendation-strip" aria-labelledby="recommendation-title">
      <div className="recommendation-heading">
        <div>
          <span className="section-kicker">FIND YOUR INSPIRATION</span>
          <h2 id="recommendation-title">推荐参考图</h2>
          <p>从猫咪、狗狗和人宠互动中寻找下一份灵感。</p>
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
