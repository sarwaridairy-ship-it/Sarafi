import { lazy, Suspense, type ReactNode, useEffect } from "react";
import {
  createBrowserRouter,
  isRouteErrorResponse,
  Outlet,
  redirect,
  RouterProvider,
  useOutletContext,
  useRouteError,
  type LoaderFunctionArgs,
} from "react-router-dom";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { recordClientError } from "../lib/financialApi";

const App = lazy(() => import("../App"));

export type WorkspaceRouteHandle = { section: string };
export type WorkspaceOutletContext = { content: ReactNode };

function WorkspaceRouteContent() {
  return useOutletContext<WorkspaceOutletContext>().content;
}

function WorkspaceLayout() {
  const context = useOutletContext<WorkspaceOutletContext>();
  return <Outlet context={context} />;
}

function loadWorkspaceRoute({ params }: LoaderFunctionArgs) {
  const organizationId = params.organizationId?.trim();
  if (!organizationId) {
    throw new Response("Missing organization scope", { status: 400 });
  }
  return { organizationId };
}

function WorkspaceNotFound() {
  return (
    <section className="panel access-denied" role="alert">
      <p className="kicker">SARAFI · 404</p>
      <h1>Page not found · صفحه پیدا نشد · پاڼه ونه موندل شوه</h1>
      <p>The requested workspace address does not exist. Use the primary navigation to continue.</p>
    </section>
  );
}

function RouteErrorPage() {
  const error = useRouteError();
  const reference = crypto.randomUUID().slice(0, 8).toUpperCase();
  const status = isRouteErrorResponse(error) ? error.status : 500;
  useEffect(() => {
    void recordClientError({
      eventName: "route_error",
      sourceName: "react_router",
      errorCode: isRouteErrorResponse(error) ? `ROUTE_${error.status}` : "ROUTE_ERROR",
      httpStatus: status,
    });
  }, [error, status]);
  return (
    <main className="app-error-shell" role="alert">
      <section className="app-error-card">
        <p className="kicker">SARAFI · {status} · {reference}</p>
        <h1>این صفحه به مشکل روبه‌رو شد</h1>
        <p>ستاسو معلومات نه دي حذف شوي. Your data was not deleted. Reload or return to the workspace home.</p>
        <div className="button-row">
          <button className="primary-action" type="button" onClick={() => window.location.reload()}>Reload</button>
          <a className="secondary-action" href="/">Home</a>
        </div>
      </section>
    </main>
  );
}

const workspaceRoutes: Array<{ path: string; section: string }> = [
  { path: "app/:organizationId/home", section: "Dashboard" },
  { path: "app/:organizationId/transactions/new", section: "Trade" },
  { path: "app/:organizationId/transactions/new/fx/buy", section: "Trade" },
  { path: "app/:organizationId/transactions/new/fx/sell", section: "Trade" },
  { path: "app/:organizationId/transactions/new/fx/exchange", section: "Trade" },
  { path: "app/:organizationId/transactions/new/money/receive/customer", section: "Trade" },
  { path: "app/:organizationId/transactions/new/money/receive/debt", section: "Debts" },
  { path: "app/:organizationId/transactions/new/money/receive/income", section: "Trade" },
  { path: "app/:organizationId/transactions/new/money/pay/customer", section: "Trade" },
  { path: "app/:organizationId/transactions/new/money/pay/debt", section: "Debts" },
  { path: "app/:organizationId/transactions/new/money/pay/expense", section: "Trade" },
  { path: "app/:organizationId/transactions/new/money/move/cashbox", section: "Trade" },
  { path: "app/:organizationId/transactions/new/money/move/branch", section: "Trade" },
  { path: "app/:organizationId/transactions/new/money/move/bank", section: "Trade" },
  { path: "app/:organizationId/transactions/new/money-in/receive", section: "Trade" },
  { path: "app/:organizationId/transactions/new/money-in/income", section: "Trade" },
  { path: "app/:organizationId/transactions/new/money-in/owner-investment", section: "Trade" },
  { path: "app/:organizationId/transactions/new/money-out/pay", section: "Trade" },
  { path: "app/:organizationId/transactions/new/money-out/expense", section: "Trade" },
  { path: "app/:organizationId/transactions/new/money-out/owner-withdrawal", section: "Trade" },
  { path: "app/:organizationId/transactions/new/move/transfer", section: "Trade" },
  { path: "app/:organizationId/transactions/new/move/bank-deposit", section: "Trade" },
  { path: "app/:organizationId/transactions/new/move/bank-withdrawal", section: "Trade" },
  { path: "app/:organizationId/transactions/new/debt/receivable", section: "Debts" },
  { path: "app/:organizationId/transactions/new/debt/payable", section: "Debts" },
  { path: "app/:organizationId/transactions/new/hawala/send", section: "Hawala" },
  { path: "app/:organizationId/transactions/new/hawala/incoming", section: "Hawala" },
  { path: "app/:organizationId/debts", section: "Debts" },
  { path: "app/:organizationId/debts/:debtId", section: "Debts" },
  { path: "app/:organizationId/debts/:debtId/settle", section: "Debts" },
  { path: "app/:organizationId/hawala", section: "Hawala" },
  { path: "app/:organizationId/hawala/incoming", section: "Hawala" },
  { path: "app/:organizationId/hawala/incoming/:transferId", section: "Hawala" },
  { path: "app/:organizationId/hawala/outgoing/:transferId", section: "Hawala" },
  { path: "app/:organizationId/hawala/payout", section: "Hawala" },
  { path: "app/:organizationId/hawala/payout/:transferId", section: "Hawala" },
  { path: "app/:organizationId/hawala/partners", section: "Hawala" },
  { path: "app/:organizationId/hawala/partners/:partnerId", section: "Hawala" },
  { path: "app/:organizationId/hawala/partners/:partnerId/settle", section: "Hawala" },
  { path: "app/:organizationId/hawala/:transferId", section: "Hawala" },
  { path: "app/:organizationId/transactions", section: "Transactions" },
  { path: "app/:organizationId/transactions/:transactionId", section: "Transactions" },
  { path: "app/:organizationId/activity", section: "Transactions" },
  { path: "app/:organizationId/money", section: "Cash & Accounts" },
  { path: "app/:organizationId/money/:accountId", section: "Cash & Accounts" },
  { path: "app/:organizationId/customers", section: "People" },
  { path: "app/:organizationId/customers/:customerId", section: "People" },
  { path: "app/:organizationId/cashboxes/:cashboxId/close", section: "Cashbox Close" },
  { path: "app/:organizationId/cashbox-close", section: "Cashbox Close" },
  { path: "app/:organizationId/reconciliation", section: "Reconciliation" },
  { path: "app/:organizationId/reports", section: "Reports" },
  { path: "app/:organizationId/compliance", section: "Compliance Reviews" },
  { path: "app/:organizationId/compliance/cases", section: "Compliance Cases" },
  { path: "app/:organizationId/compliance/cases/:caseId", section: "Compliance Cases" },
  { path: "app/:organizationId/control", section: "Control" },
  { path: "app/:organizationId/control/team", section: "Team & Devices" },
  { path: "app/:organizationId/control/team/approvals/:approvalId", section: "Team & Devices" },
  { path: "app/:organizationId/control/team/devices/:deviceId", section: "Team & Devices" },
  { path: "app/:organizationId/control/security", section: "Security" },
  { path: "app/:organizationId/control/rates", section: "Rates" },
  { path: "app/:organizationId/control/reports", section: "Reports" },
  { path: "app/:organizationId/control/compliance", section: "Compliance" },
  { path: "app/:organizationId/control/billing", section: "Billing" },
  { path: "app/:organizationId/control/import", section: "Import" },
  { path: "app/:organizationId/control/business", section: "Business Settings" },
  { path: "app/:organizationId/control/settings", section: "Business Settings" },
  { path: "app/:organizationId/control/*", section: "Control" },
  { path: "app/:organizationId/offline", section: "Offline" },

  // Read-only aliases preserve old bookmarks while every new link uses the
  // canonical v6 subtype above.
  { path: "app/:organizationId/transactions/new/money-in/customer", section: "Trade" },
  { path: "app/:organizationId/transactions/new/money-in/debt-payment", section: "Debts" },
  { path: "app/:organizationId/transactions/new/money-in/owner-capital", section: "Trade" },
  { path: "app/:organizationId/transactions/new/money-out/customer", section: "Trade" },
  { path: "app/:organizationId/transactions/new/money-out/debt-payment", section: "Debts" },
  { path: "app/:organizationId/transactions/new/move/cashbox", section: "Trade" },
  { path: "app/:organizationId/transactions/new/move/branch", section: "Trade" },
  { path: "app/:organizationId/transactions/new/move/bank", section: "Trade" },
  { path: "app/:organizationId/debts/settle", section: "Debts" },
  { path: "app/:organizationId/transactions/new/hawala/payout", section: "Hawala" },
  { path: "app/:organizationId/transactions/new/hawala/settlement", section: "Hawala" },
  { path: "app/:organizationId/transactions/new/opening-money", section: "Trade" },
  { path: "app/:organizationId/transactions/new/correction", section: "Transactions" },
];

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <AppErrorBoundary>
        <Suspense fallback={<main className="app-loading-shell" role="status" aria-live="polite">SARAFI</main>}>
          <App />
        </Suspense>
      </AppErrorBoundary>
    ),
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <WorkspaceRouteContent />, handle: { section: "Dashboard" } satisfies WorkspaceRouteHandle },
      { path: "public/*", element: <WorkspaceRouteContent />, handle: { section: "Public" } satisfies WorkspaceRouteHandle },
      { path: "auth/*", element: <WorkspaceRouteContent />, handle: { section: "Auth" } satisfies WorkspaceRouteHandle },
      { path: "pending/*", element: <WorkspaceRouteContent />, handle: { section: "Pending" } satisfies WorkspaceRouteHandle },
      { path: "platform-admin", element: <WorkspaceRouteContent />, handle: { section: "Platform" } satisfies WorkspaceRouteHandle },
      {
        path: "app/:organizationId",
        loader: loadWorkspaceRoute,
        element: <WorkspaceLayout />,
        errorElement: <RouteErrorPage />,
        children: [
          {
            index: true,
            loader: ({ params }: LoaderFunctionArgs) => redirect(`/app/${params.organizationId}/home`),
          },
          ...workspaceRoutes.map(({ path, section }) => ({
            path: path.replace("app/:organizationId/", ""),
            loader: loadWorkspaceRoute,
            element: <WorkspaceRouteContent />,
            handle: { section } satisfies WorkspaceRouteHandle,
          })),
        ],
      },
      { path: "*", element: <WorkspaceNotFound />, handle: { section: "Not Found" } satisfies WorkspaceRouteHandle },
    ],
  },
]);

export function SarafiRouter() {
  return <RouterProvider router={router} />;
}
