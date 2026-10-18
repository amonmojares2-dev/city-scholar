import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { fetchSession } from './lib/auth';

export default function App() {
  useEffect(() => {
    void fetchSession();
  }, []);

  return <RouterProvider router={router} />;
}
