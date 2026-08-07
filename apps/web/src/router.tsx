import { createRootRoute, createRoute, createRouter, lazyRouteComponent, Outlet } from '@tanstack/react-router'
import { HomePage } from './pages/HomePage'
import { JoinPage } from './pages/JoinPage'
import { NotFoundPage } from './pages/NotFoundPage'

const SessionPage = lazyRouteComponent(() => import('./pages/SessionPage'), 'SessionPage')
const InstructorPage = lazyRouteComponent(() => import('./pages/InstructorPage'), 'InstructorPage')
const PresentationPage = lazyRouteComponent(() => import('./pages/PresentationPage'), 'PresentationPage')
const BuilderPage = lazyRouteComponent(() => import('./pages/BuilderPage'), 'BuilderPage')
const ReviewPage = lazyRouteComponent(() => import('./pages/ReviewPage'), 'ReviewPage')

const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: NotFoundPage })
const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/join/$code', component: JoinPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/session/$sessionId', component: SessionPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/instructor/$sessionId', component: InstructorPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/present/$sessionId', component: PresentationPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/builder', component: BuilderPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/builder/$scenarioId', component: BuilderPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/review/$sessionId', component: ReviewPage }),
])

export const router = createRouter({ routeTree, defaultPreload: 'intent' })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
