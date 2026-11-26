import {
  Activity,
  BookOpen,
  Bus,
  ClipboardList,
  FileText,
  History,
  Languages,
  LayoutDashboard,
  MessageSquare,
  Mic,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import type { TranslationKey } from '../i18n/translations'

export type HelpTarget = 'diagnosis' | 'fleet' | 'manuals' | 'tickets' | 'chief' | 'settings'

export type OnboardingStep = {
  id: string
  icon: LucideIcon
  titleKey: TranslationKey
  bodyKey: TranslationKey
  pointKeys: TranslationKey[]
}

export type HelpCard = {
  id: string
  icon: LucideIcon
  titleKey: TranslationKey
  bodyKey: TranslationKey
  stepKeys: TranslationKey[]
  target: HelpTarget
}

export type FaqItem = {
  id: string
  questionKey: TranslationKey
  answerKey: TranslationKey
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    icon: Sparkles,
    titleKey: 'onboarding.step.1.title',
    bodyKey: 'onboarding.step.1.body',
    pointKeys: ['onboarding.step.1.point.1', 'onboarding.step.1.point.2', 'onboarding.step.1.point.3'],
  },
  {
    id: 'diagnosis',
    icon: Activity,
    titleKey: 'onboarding.step.2.title',
    bodyKey: 'onboarding.step.2.body',
    pointKeys: ['onboarding.step.2.point.1', 'onboarding.step.2.point.2', 'onboarding.step.2.point.3'],
  },
  {
    id: 'chat',
    icon: MessageSquare,
    titleKey: 'onboarding.step.3.title',
    bodyKey: 'onboarding.step.3.body',
    pointKeys: ['onboarding.step.3.point.1', 'onboarding.step.3.point.2', 'onboarding.step.3.point.3'],
  },
  {
    id: 'manuals',
    icon: BookOpen,
    titleKey: 'onboarding.step.4.title',
    bodyKey: 'onboarding.step.4.body',
    pointKeys: ['onboarding.step.4.point.1', 'onboarding.step.4.point.2', 'onboarding.step.4.point.3'],
  },
  {
    id: 'tickets',
    icon: ClipboardList,
    titleKey: 'onboarding.step.5.title',
    bodyKey: 'onboarding.step.5.body',
    pointKeys: ['onboarding.step.5.point.1', 'onboarding.step.5.point.2', 'onboarding.step.5.point.3'],
  },
  {
    id: 'fleet',
    icon: Bus,
    titleKey: 'onboarding.step.6.title',
    bodyKey: 'onboarding.step.6.body',
    pointKeys: ['onboarding.step.6.point.1', 'onboarding.step.6.point.2', 'onboarding.step.6.point.3'],
  },
  {
    id: 'ready',
    icon: Languages,
    titleKey: 'onboarding.step.7.title',
    bodyKey: 'onboarding.step.7.body',
    pointKeys: ['onboarding.step.7.point.1', 'onboarding.step.7.point.2', 'onboarding.step.7.point.3'],
  },
]

export const HELP_CARDS: HelpCard[] = [
  {
    id: 'start',
    icon: Sparkles,
    titleKey: 'help.card.start.title',
    bodyKey: 'onboarding.step.1.body',
    stepKeys: ['onboarding.step.1.point.1', 'onboarding.step.1.point.2', 'onboarding.step.1.point.3'],
    target: 'diagnosis',
  },
  {
    id: 'diagnosis',
    icon: Activity,
    titleKey: 'help.card.diagnosis.title',
    bodyKey: 'onboarding.step.2.body',
    stepKeys: ['onboarding.step.2.point.1', 'onboarding.step.2.point.2', 'onboarding.step.2.point.3'],
    target: 'diagnosis',
  },
  {
    id: 'result',
    icon: ShieldCheck,
    titleKey: 'help.card.result.title',
    bodyKey: 'help.card.result.body',
    stepKeys: ['help.card.result.step.1', 'help.card.result.step.2', 'help.card.result.step.3'],
    target: 'diagnosis',
  },
  {
    id: 'chat',
    icon: MessageSquare,
    titleKey: 'help.card.chat.title',
    bodyKey: 'onboarding.step.3.body',
    stepKeys: ['onboarding.step.3.point.1', 'onboarding.step.3.point.2', 'onboarding.step.3.point.3'],
    target: 'diagnosis',
  },
  {
    id: 'voice',
    icon: Mic,
    titleKey: 'help.card.voice.title',
    bodyKey: 'help.card.voice.body',
    stepKeys: ['help.card.voice.step.1', 'help.card.voice.step.2', 'help.card.voice.step.3'],
    target: 'diagnosis',
  },
  {
    id: 'manuals',
    icon: BookOpen,
    titleKey: 'help.card.manuals.title',
    bodyKey: 'onboarding.step.4.body',
    stepKeys: ['onboarding.step.4.point.1', 'onboarding.step.4.point.2', 'onboarding.step.4.point.3'],
    target: 'manuals',
  },
  {
    id: 'pdf',
    icon: FileText,
    titleKey: 'help.card.pdf.title',
    bodyKey: 'help.card.pdf.body',
    stepKeys: ['help.card.pdf.step.1', 'help.card.pdf.step.2', 'help.card.pdf.step.3'],
    target: 'manuals',
  },
  {
    id: 'ticket',
    icon: ClipboardList,
    titleKey: 'help.card.ticket.title',
    bodyKey: 'onboarding.step.5.body',
    stepKeys: ['onboarding.step.5.point.1', 'onboarding.step.5.point.2', 'onboarding.step.5.point.3'],
    target: 'tickets',
  },
  {
    id: 'fleet',
    icon: Bus,
    titleKey: 'help.card.fleet.title',
    bodyKey: 'onboarding.step.6.body',
    stepKeys: ['onboarding.step.6.point.1', 'onboarding.step.6.point.2', 'onboarding.step.6.point.3'],
    target: 'fleet',
  },
  {
    id: 'history',
    icon: History,
    titleKey: 'help.card.history.title',
    bodyKey: 'help.card.history.body',
    stepKeys: ['help.card.history.step.1', 'help.card.history.step.2', 'help.card.history.step.3'],
    target: 'diagnosis',
  },
  {
    id: 'chief',
    icon: LayoutDashboard,
    titleKey: 'help.card.chief.title',
    bodyKey: 'help.card.chief.body',
    stepKeys: ['help.card.chief.step.1', 'help.card.chief.step.2', 'help.card.chief.step.3'],
    target: 'chief',
  },
  {
    id: 'settings',
    icon: Languages,
    titleKey: 'help.card.settings.title',
    bodyKey: 'help.card.settings.body',
    stepKeys: ['onboarding.step.7.point.1', 'onboarding.step.7.point.2'],
    target: 'settings',
  },
]

export const FAQ_ITEMS: FaqItem[] = Array.from({ length: 8 }, (_, index) => ({
  id: `faq-${index + 1}`,
  questionKey: `help.faq.q.${index + 1}` as TranslationKey,
  answerKey: `help.faq.a.${index + 1}` as TranslationKey,
}))

export const HELP_TIPS = {
  confidence: 'help.tip.confidence',
  score: 'help.tip.score',
  failed: 'help.tip.failed',
  noTicket: 'help.tip.noTicket',
  quarantine: 'help.tip.quarantine',
  noSource: 'help.tip.noSource',
  otherSession: 'help.tip.otherSession',
} as const satisfies Record<string, TranslationKey>
