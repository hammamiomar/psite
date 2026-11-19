import { createFigureReplay, type FigureReplay } from './figure-replay'
import { FIGURE_SHADERS } from './figure-shaders'
import { readFigureMaterial, type FigureMaterial } from './material-file'
import { clockAdvance, strokeDiscs, type BrushDisc } from './figure-clock-rules'
import { requestSharedDevice } from './graphics-device'
import {
  cellsForRule,
  clockWithoutBacklog,
  fieldCanvas,
  FLATNESS_CHECK_EVERY_STEPS,
  gridSide,
  isDueForNextRule,
  nextRoundOrder,
  pictureSpread,
  shouldStartAgainFromNoise,
  shuffledOrder,
  STEPS_PER_SECOND,
  stepsThisFrame,
  type FieldCanvas,
  type FieldCells,
} from './opening-automaton-rules'

export interface PortalRuleChoice {
  block: number
  materialUrl: string
  stillUrl: string
  steps: number
  twoGrids: boolean
}

const BRUSH_RADIUS_CELLS = 12
const FIELD_SEED = 2026111901
const STILL_CELLS = 128

const inWindow = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    const el = entry.target.closest('portal-nca-sliver') as unknown as
      | PortalNcaSliver
      | null
    el?.setInView(entry.isIntersecting)
  })
})

const fieldSizes = new ResizeObserver((entries) => {
  entries.forEach((entry) => {
    const el = entry.target.closest('portal-nca-sliver') as unknown as
      | PortalNcaSliver
      | null
    el?.fitField()
  })
})

export class PortalNcaSliver extends HTMLElement {
  private rules: PortalRuleChoice[] = []
  private materials = new Map<string, Promise<FigureMaterial>>()
  private canvases: HTMLCanvasElement[] = []
  private shownCanvas = 0
  private device: GPUDevice | null = null
  private replay: FigureReplay | null = null
  private opening = false
  private side = 0
  private canvasSize: FieldCanvas = { width: 1, height: 1, pixelsPerCell: 1 }
  private order: number[] = []
  private placeInOrder = 0
  private ruleIndex = 0
  private ruleStartedAtStep = 0
  private spreadReadAtStep = 0
  private spreadAtLastCheck: number | null = null
  private clockStep = 0
  private lastFrameAt: number | null = null
  private frameRequest = 0
  private working = false
  private reducedMotion = false
  private inView = true
  private restartDue = false
  private redrawDue = false
  private stamps: BrushDisc[] = []
  private brushFrom: { x: number; y: number } | null = null

  private partNamed<Part extends HTMLElement>(name: string): Part {
    return this.querySelector<Part>(`[data-part="${name}"]`)!
  }

  connectedCallback() {
    const rulesJson = this.partNamed('rules').textContent
    if (!rulesJson) return
    this.rules = JSON.parse(rulesJson) as PortalRuleChoice[]
    this.order = shuffledOrder(this.rules.length, Math.random)
    this.ruleIndex = this.order[0]
    this.partNamed('still').style.backgroundImage =
      `url(${this.rules[this.ruleIndex].stillUrl})`
    this.canvases = [
      ...this.querySelectorAll<HTMLCanvasElement>('[data-part="canvas"]'),
    ]
    this.reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    this.connectBrush()
    const field = this.partNamed('field')
    inWindow.observe(field)
    fieldSizes.observe(field)
    if (this.reducedMotion) {
      this.dataset.state = 'still'
    } else {
      void this.open()
    }
  }

  disconnectedCallback() {
    const field = this.querySelector<HTMLElement>('[data-part="field"]')
    if (field) {
      inWindow.unobserve(field)
      fieldSizes.unobserve(field)
    }
    cancelAnimationFrame(this.frameRequest)
    this.frameRequest = 0
    this.replay?.dispose()
    this.replay = null
  }

  setInView(inView: boolean) {
    this.inView = inView
    this.wake()
  }

  fitField() {
    const size = this.sizeOfItsField()
    this.style.setProperty(
      '--still-tile',
      `${STILL_CELLS * size.pixelsPerCell}px`,
    )
    if (!this.replay) return
    const unchanged =
      size.width === this.canvasSize.width &&
      size.height === this.canvasSize.height &&
      size.pixelsPerCell === this.canvasSize.pixelsPerCell
    if (unchanged) return
    this.canvasSize = size
    this.applyCanvasSize(this.replay)
    this.redrawDue = true
    this.wake()
  }

  private async open() {
    if (this.replay || this.opening) return
    this.opening = true
    try {
      const device = await requestSharedDevice()
      if (!device) {
        this.showFallbackStill()
        return
      }
      this.device = device
      this.side = gridSide(this.partNamed('field').getBoundingClientRect().width)
      this.canvasSize = this.sizeOfItsField()
      this.replay = await this.makeReplay(
        this.canvases[this.shownCanvas],
        await this.materialOf(this.ruleIndex),
      )
      this.ruleStartedAtStep = 0
      this.clockStep = 0
      this.redrawDue = true
    } catch {
      this.showFallbackStill()
    } finally {
      this.opening = false
      this.wake()
    }
  }

  private materialOf(index: number): Promise<FigureMaterial> {
    const url = this.rules[index].materialUrl
    let material = this.materials.get(url)
    if (!material) {
      material = fetch(url).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Material answered ${response.status}`)
        }
        return readFigureMaterial(await response.json())
      })
      this.materials.set(url, material)
    }
    return material
  }

  private makeReplay(
    canvas: HTMLCanvasElement,
    material: FigureMaterial,
    cells?: FieldCells,
  ): Promise<FigureReplay> {
    return createFigureReplay(
      {
        canvas,
        device: this.device!,
        side: this.side,
        seed: FIELD_SEED,
        scale: this.canvasSize.pixelsPerCell,
        tiled: {
          width: this.canvasSize.width,
          height: this.canvasSize.height,
        },
        initialState: cells,
        onDeviceLost: () => this.showFallbackStill(),
      },
      { values: material.values, fireRate: material.file.rule.fireRate },
      FIGURE_SHADERS,
    )
  }

  private ruleAfterThisOne(): number {
    this.placeInOrder += 1
    if (this.placeInOrder >= this.order.length) {
      this.order = nextRoundOrder(
        this.rules.length,
        this.ruleIndex,
        Math.random,
      )
      this.placeInOrder = 0
    }
    return this.order[this.placeInOrder]
  }

  private async takeRule(index: number) {
    if (!this.replay) return
    const from = this.replay
    const material = await this.materialOf(index)
    const cells: FieldCells = {
      tick: from.tick,
      fine: await from.readState(),
      coarse: this.rules[this.ruleIndex].twoGrids
        ? await from.readCoarseState()
        : undefined,
    }
    const spare = 1 - this.shownCanvas
    const next = await this.makeReplay(
      this.canvases[spare],
      material,
      cellsForRule(cells, this.side, this.rules[index].twoGrids),
    )
    this.applyCanvasSize(next)
    await next.present()
    if (this.replay !== from) {
      next.dispose()
      return
    }
    this.canvases[spare].dataset.shown = ''
    delete this.canvases[this.shownCanvas].dataset.shown
    this.shownCanvas = spare
    from.dispose()
    this.replay = next
    this.ruleIndex = index
    this.ruleStartedAtStep = next.tick
    this.clockStep = next.tick
    this.forgetSpread(next.tick)
  }

  private async watchForAFlatField(replay: FigureReplay) {
    if (replay.tick - this.spreadReadAtStep < FLATNESS_CHECK_EVERY_STEPS) return
    const spread = pictureSpread(await replay.readPixels())
    if (shouldStartAgainFromNoise(this.spreadAtLastCheck, spread)) {
      this.restartDue = true
    }
    this.spreadAtLastCheck = spread
    this.spreadReadAtStep = replay.tick
  }

  private forgetSpread(step: number) {
    this.spreadAtLastCheck = null
    this.spreadReadAtStep = step
  }

  private sizeOfItsField(): FieldCanvas {
    const box = this.partNamed('field').getBoundingClientRect()
    return fieldCanvas(
      box.width,
      box.height,
      this.side || gridSide(box.width),
    )
  }

  private applyCanvasSize(replay: FigureReplay) {
    replay.setScale(this.canvasSize.pixelsPerCell)
    replay.setTiled({
      width: this.canvasSize.width,
      height: this.canvasSize.height,
    })
  }

  private showFallbackStill() {
    this.replay?.dispose()
    this.replay = null
    this.stamps.length = 0
    this.dataset.state = 'still'
  }

  private get growing(): boolean {
    return !this.reducedMotion && this.inView
  }

  private get hasEdits(): boolean {
    return this.restartDue || this.redrawDue || this.stamps.length > 0
  }

  private wake() {
    if (this.frameRequest || this.working || !this.replay) return
    if (!this.growing && !this.hasEdits) return
    this.frameRequest = requestAnimationFrame((now) => {
      this.frameRequest = 0
      void this.frame(now)
    })
  }

  private async frame(now: number) {
    const replay = this.replay
    if (!replay) return
    this.working = true
    try {
      const elapsedMs = this.lastFrameAt === null ? 0 : now - this.lastFrameAt
      this.lastFrameAt = now
      if (this.growing) {
        this.clockStep += clockAdvance(elapsedMs, STEPS_PER_SECOND)
      }
      let drew = false
      if (this.restartDue) {
        this.restartDue = false
        replay.reseed(FIELD_SEED)
        this.ruleStartedAtStep = 0
        this.clockStep = 0
        this.forgetSpread(0)
        this.redrawDue = true
      }
      if (this.stamps.length > 0) {
        await replay.stamp(this.stamps.splice(0))
        drew = true
      }
      const steps = this.growing
        ? stepsThisFrame(this.clockStep, replay.tick)
        : 0
      if (steps > 0) {
        await replay.advance(steps)
        drew = true
      } else if (this.redrawDue && !drew) {
        await replay.present()
        drew = true
      }
      this.clockStep = clockWithoutBacklog(this.clockStep, replay.tick)
      if (drew) {
        this.redrawDue = false
        this.dataset.state = 'live'
        this.canvases[this.shownCanvas].dataset.shown = ''
      }
      if (
        this.growing &&
        isDueForNextRule(
          replay.tick,
          this.ruleStartedAtStep,
          this.rules[this.ruleIndex].steps,
        )
      ) {
        await this.takeRule(this.ruleAfterThisOne())
      } else if (this.growing) {
        await this.watchForAFlatField(replay)
      }
    } catch {
      if (this.replay) this.showFallbackStill()
    } finally {
      this.working = false
      if (!this.growing && !this.hasEdits) this.lastFrameAt = null
      this.wake()
    }
  }

  private connectBrush() {
    const field = this.partNamed('field')
    const ring = this.partNamed('brush-ring')
    const placeOf = (event: PointerEvent) => {
      const box = field.getBoundingClientRect()
      const cellPixels =
        this.canvasSize.pixelsPerCell * (box.width / this.canvasSize.width)
      return {
        left: event.clientX - box.left,
        top: event.clientY - box.top,
        cellPixels,
      }
    }
    const placeRing = (event: PointerEvent) => {
      const { left, top, cellPixels } = placeOf(event)
      ring.style.left = `${left}px`
      ring.style.top = `${top}px`
      ring.style.width = `${2 * BRUSH_RADIUS_CELLS * cellPixels}px`
    }
    const cellAt = (event: PointerEvent) => {
      const { left, top, cellPixels } = placeOf(event)
      return { x: left / cellPixels, y: top / cellPixels }
    }
    field.addEventListener('pointerdown', (event) => {
      field.setPointerCapture(event.pointerId)
      this.brushFrom = cellAt(event)
    })
    field.addEventListener('pointerenter', placeRing)
    field.addEventListener('pointermove', (event) => {
      placeRing(event)
      if (!this.brushFrom || !this.replay) return
      const at = cellAt(event)
      this.stamps.push(...strokeDiscs(this.brushFrom, at, BRUSH_RADIUS_CELLS))
      this.brushFrom = at
      this.wake()
    })
    const endStroke = () => {
      this.brushFrom = null
    }
    field.addEventListener('pointerup', endStroke)
    field.addEventListener('pointercancel', endStroke)
  }
}

if (!customElements.get('portal-nca-sliver')) {
  customElements.define('portal-nca-sliver', PortalNcaSliver)
}
