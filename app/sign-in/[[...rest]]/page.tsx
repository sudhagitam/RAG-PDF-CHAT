import { SignIn } from '@clerk/nextjs';

   export default function SignInPage() {
     return (
       <div style={{
         display: 'flex',
         justifyContent: 'center',
         alignItems: 'center',
         minHeight: '100vh',
         backgroundColor: '#000',
       }}>
         <SignIn />
       </div>
     );
   }