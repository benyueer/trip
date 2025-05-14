import { useRoutes } from 'react-router-dom'
import { Home } from '../pages/Home'
import { Place } from '../pages/Place'
import { Plan } from '../pages/Plan'
import { Trip } from '../pages/Trip'
export const Routes = () => {
  return useRoutes([
    {
      path: '/',
      element: <Home />,
      children: [
        {
          path: 'place',
          element: <Place />,
        },

        {
          path: 'plan',
          element: <Plan />,
        },
        {
          path: 'profile',
          element: <h1>Profile</h1>,
        },
      ],
    },
    {
      path: '/trip',
      element: <Trip />,
    },
  ])
}
