/**
 * Top-level React app with React Router.
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HomePage } from './HomePage';
import { BoardPage } from './BoardPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/board/:id" element={<BoardPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
