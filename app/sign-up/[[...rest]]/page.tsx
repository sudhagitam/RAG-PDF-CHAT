import { SignUp } from '@clerk/nextjs';

   export default function SignUpPage() {
     return (
       <div style={{
         display: 'flex',
         justifyContent: 'center',
         alignItems: 'center',
         minHeight: '100vh',
         backgroundColor: '#000',
       }}>
         <SignUp />
       </div>
     );
   }