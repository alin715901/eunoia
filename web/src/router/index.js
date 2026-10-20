import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import ChatsListView from '@/views/ChatsListView.vue'
import ContactChatView from '@/views/ContactChatView.vue'
import ContactSettingsView from '@/views/ContactSettingsView.vue'
import ContactSpaceView from '@/views/ContactSpaceView.vue'
import CardsView from '@/views/CardsView.vue'
import SettingsView from '@/views/SettingsView.vue'
import HomeCardSettingsView from '@/views/HomeCardSettingsView.vue'
import AnniversaryView from '@/views/AnniversaryView.vue'
import WorkspaceView from '@/views/WorkspaceView.vue'
import DivinationView from '@/views/DivinationView.vue'
import LettersView from '@/views/LettersView.vue'
import MailboxView from '@/views/MailboxView.vue'
import MomentsView from '@/views/MomentsView.vue'
import DiaryView from '@/views/DiaryView.vue'
import MemoView from '@/views/MemoView.vue'
import MoodView from '@/views/MoodView.vue'
import PeriodView from '@/views/PeriodView.vue'
import AlbumView from '@/views/AlbumView.vue'
import MusicView from '@/views/MusicView.vue'
import MusicSettingsView from '@/views/MusicSettingsView.vue'
import CinemaView from '@/views/CinemaView.vue'
import GameView from '@/views/GameView.vue'
import ArchiveView from '@/views/ArchiveView.vue'
import ReplySettingsView from '@/views/settings/ReplySettingsView.vue'
import ProactiveSettingsView from '@/views/settings/ProactiveSettingsView.vue'
import MomentSettingsView from '@/views/settings/MomentSettingsView.vue'
import LetterSettingsView from '@/views/settings/LetterSettingsView.vue'
import ChatBgView from '@/views/settings/ChatBgView.vue'
import ChatFontView from '@/views/settings/ChatFontView.vue'
import BubbleStyleView from '@/views/settings/BubbleStyleView.vue'
import CallSettingsView from '@/views/settings/CallSettingsView.vue'
import StatsView from '@/views/StatsView.vue'

const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/chats', name: 'chats', component: ChatsListView },
  { path: '/contacts/:id/chat', name: 'contact-chat', component: ContactChatView, props: true },
  { path: '/contacts/:id/settings', name: 'contact-settings', component: ContactSettingsView, props: true },
  { path: '/contacts/:id/settings/reply', name: 'contact-reply-settings', component: ReplySettingsView, props: true },
  { path: '/contacts/:id/settings/proactive', name: 'contact-proactive-settings', component: ProactiveSettingsView, props: true },
  { path: '/contacts/:id/settings/moments', name: 'contact-moment-settings', component: MomentSettingsView, props: true },
  { path: '/contacts/:id/settings/letters', name: 'contact-letter-settings', component: LetterSettingsView, props: true },
  { path: '/contacts/:id/settings/bg', name: 'contact-chat-bg', component: ChatBgView, props: true },
  { path: '/contacts/:id/settings/font', name: 'contact-chat-font', component: ChatFontView, props: true },
  { path: '/contacts/:id/settings/bubble', name: 'contact-bubble-style', component: BubbleStyleView, props: true },
  { path: '/contacts/:id/settings/call', name: 'contact-call-settings', component: CallSettingsView, props: true },
  { path: '/contacts/:id/settings/avatar', name: 'contact-avatar-settings', component: () => import('@/views/settings/AvatarSettingsView.vue'), props: true },
  { path: '/contacts/:id/space', name: 'contact-space', component: ContactSpaceView, props: true },
  { path: '/cards', name: 'cards', component: CardsView, props: { contactId: null } },
  { path: '/contacts/:id/cards', name: 'contact-cards', component: CardsView, props: (route) => ({ contactId: route.params.id }) },
  { path: '/settings', name: 'settings', component: SettingsView },
  { path: '/settings/care-texts', name: 'care-texts', component: () => import('@/views/settings/CareTextsView.vue') },
  { path: '/theme', name: 'theme', component: () => import('@/views/ThemeView.vue') },
  { path: '/about', name: 'about', component: () => import('@/views/settings/AboutView.vue') },
  { path: '/storage', name: 'storage', component: () => import('@/views/settings/StorageView.vue') },
  { path: '/home-card-settings', name: 'home-card-settings', component: HomeCardSettingsView },
  { path: '/workspace', name: 'workspace', component: WorkspaceView },
  { path: '/moments', name: 'moments', component: MomentsView },
  { path: '/moments/compose', name: 'moment-compose', component: () => import('@/views/MomentComposeView.vue') },
  { path: '/letters', name: 'letters', component: LettersView },
  { path: '/contacts/:id/mailbox', name: 'mailbox', component: MailboxView, props: true },
  { path: '/divination', name: 'divination', component: DivinationView },
  { path: '/diary', name: 'diary', component: DiaryView },
  { path: '/anniversary', name: 'anniversary', component: AnniversaryView },
  { path: '/archive', name: 'archive', component: ArchiveView },
  { path: '/music', name: 'music', component: MusicView },
  { path: '/music/settings', name: 'musicSettings', component: MusicSettingsView },
  { path: '/cinema', name: 'cinema', component: CinemaView },
  { path: '/game', name: 'game', component: GameView },
  { path: '/game/entry/:kind', name: 'game-entry', component: () => import('@/views/GameEntryView.vue'), props: true },
  { path: '/game/history/:kind', name: 'game-history', component: () => import('@/views/GameHistoryView.vue'), props: true },
  { path: '/game/invite/:kind', name: 'game-invite', component: () => import('@/views/GameInviteView.vue'), props: true },
  { path: '/game/play/:kind', name: 'game-play', component: () => import('@/views/GamePlayView.vue'), props: true },
  { path: '/mood', name: 'mood', component: MoodView },
  { path: '/memo', name: 'memo', component: MemoView },
  { path: '/period', name: 'period', component: PeriodView },
  { path: '/album', name: 'album', component: AlbumView },
  { path: '/album/:id', name: 'album-detail', component: () => import('@/views/AlbumDetailView.vue'), props: true },
  { path: '/stats', name: 'stats', component: StatsView },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
