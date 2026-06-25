export type AppRoute = "home" | "scenario-playing" | "scenario-library" | "after-action-review";

export interface RouteState {
  currentRoute: AppRoute;
  params?: any;
}
