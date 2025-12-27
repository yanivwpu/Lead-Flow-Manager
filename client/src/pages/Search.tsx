import { Search as SearchIcon } from "lucide-react";

export function Search() {
  return (
    <div className="flex-1 h-full bg-white flex flex-col items-center justify-center p-8">
       <div className="w-full max-w-lg text-center">
         <div className="h-20 w-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
           <SearchIcon className="h-10 w-10 text-gray-400" />
         </div>
         <h2 className="text-2xl font-bold text-gray-900 mb-2">Search Everything</h2>
         <p className="text-gray-500 mb-8">Find chats, leads, notes, and tasks across your CRM.</p>
         
         <div className="relative">
           <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
           <input 
             type="text" 
             className="w-full h-14 pl-12 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-lg focus:outline-none focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green shadow-sm"
             placeholder="Search keywords..."
             autoFocus
           />
         </div>
         
         <div className="mt-8 flex flex-wrap justify-center gap-2">
           {['"Proposal"', 'Lost Leads', 'High Value', 'Follow ups'].map(tag => (
             <span key={tag} className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-600 hover:border-gray-300 hover:bg-gray-50 cursor-pointer transition-colors">
               {tag}
             </span>
           ))}
         </div>
       </div>
    </div>
  );
}
