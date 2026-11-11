import { createFileRoute, Link } from '@tanstack/react-router'
import { Section } from '@/components/common/FormSection'
import { PageHeader } from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'

export const Route = createFileRoute('/guide')({
  staticData: { title: '使用说明与免责声明' },
  component: GuidePage,
})

function GuidePage() {
  return (
    <>
      <PageHeader title="使用说明与免责声明" description="了解图库和合成台的使用规则" />

      <Section title="使用流程" className="@lg/section:grid-cols-2">
        <div className="rounded-2xl bg-background p-4">
          <Badge>1. 选参考</Badge>
          <h3 className="mt-2 text-sm font-semibold">浏览参考图库</h3>
          <p className="mt-1 text-xs text-muted-foreground">从猫狗种类、宠物姿势、宠物服装、人宠互动、服装穿搭和人像颜值库中选择图片，查看大图或加入合成台。</p>
        </div>
        <div className="rounded-2xl bg-background p-4">
          <Badge>2. 做组合</Badge>
          <h3 className="mt-2 text-sm font-semibold">按场景组合参考图</h3>
          <p className="mt-1 text-xs text-muted-foreground">人物、服装、姿势、宠物和宠物服装齐全时使用五图合成；只有宠物、宠物服装和姿势时使用三图合成；只有宠物和姿势时使用双图合成。</p>
        </div>
        <div className="rounded-2xl bg-background p-4">
          <Badge>3. 开始合成</Badge>
          <h3 className="mt-2 text-sm font-semibold">确认后生成</h3>
          <p className="mt-1 text-xs text-muted-foreground">合成台会根据当前参考图自动匹配工作流。人像和宠物同时存在时，姿势优先使用人宠互动图库中的姿势。</p>
        </div>
      </Section>

      <Section title="免责声明与合规使用规范（必读）" className="@lg/section:grid-cols-1">
        <div className="space-y-2.5 rounded-2xl bg-background p-4 text-xs leading-relaxed text-muted-foreground">
          <p><strong className="text-foreground">1. 使用范围：</strong>本网站用于宠物姿态、猫狗外形和人宠互动构图参考，以及合法的个人创作和技术交流。请遵守所在地区的法律法规和内容平台规则。</p>
          <p><strong className="text-foreground">2. 肖像与隐私：</strong>使用包含人物的图片前，请确认已获得必要的授权。不得使用本网站制作冒充他人、未经授权换脸、深度伪造或侵犯隐私的内容。</p>
          <p><strong className="text-foreground">3. 生成结果：</strong>合成台调用的云端模型、本地服务和第三方接口由使用者自行配置。生成结果的准确性、版权和使用风险由使用者自行判断并承担。</p>
          <p><strong className="text-foreground">4. 责任限制：</strong>因违反法律、第三方协议、图片授权条件或不当使用产生的责任，由使用者独立承担，与本项目维护者无关。</p>
        </div>
      </Section>

      <Section title="图片来源与版权说明" className="@lg/section:grid-cols-1">
        <div className="space-y-2.5 rounded-2xl bg-background p-4 text-xs leading-relaxed text-muted-foreground">
          <p><strong className="text-foreground">宠物图库：</strong>猫咪、狗狗和人宠互动图片仅用于参考和创作，不因收录到本项目而改变图片原有的版权和授权条件。</p>
          <p><strong className="text-foreground">项目自有图片：</strong>项目维护者自己生成并拥有必要授权的图片，采用 <a className="underline hover:text-foreground" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> 授权，使用时请保留署名。</p>
          <p><strong className="text-foreground">使用边界：</strong>使用任何参考图前，请自行确认图片来源、授权范围和发布平台规则。</p>
        </div>
      </Section>

      <Section title="设计致谢" className="@lg/section:grid-cols-1">
        <p className="rounded-2xl bg-background p-4 text-xs leading-relaxed text-muted-foreground">本网站的页面组织和图库交互设计参考了 <a className="underline hover:text-foreground" href="https://github.com/anhao/ai-pose-gallery-zh" target="_blank" rel="noopener noreferrer">anhao/ai-pose-gallery-zh</a>，感谢原项目作者提供的开源实现思路。本项目根据宠物图库场景进行了独立调整和视觉改造。</p>
      </Section>
      <p className="text-xs text-muted-foreground">项目源代码见 <a className="underline hover:text-foreground" href="https://github.com/Chen1727/ai-pose-pet" target="_blank" rel="noopener noreferrer">GitHub 仓库</a>。</p>
      <Link to="/pets" className="text-sm font-medium text-primary underline underline-offset-4">返回图库总览</Link>
    </>
  )
}
