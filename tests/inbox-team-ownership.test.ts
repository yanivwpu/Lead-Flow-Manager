import test from "node:test";
import assert from "node:assert/strict";
import { belongsInInboxTab, canAssignConversation, inboxEmptyKind, replyIdentity, type InboxTeammate } from "../shared/inboxTeam";
const members: InboxTeammate[] = [
  {id:"owner",memberId:"owner-a",role:"owner",status:"active",name:"Owner",email:"owner@example.com"},
  {id:"support-row",memberId:"support",role:"member",status:"active",name:"Support",email:"support@example.com"},
  {id:"admin-row",memberId:"admin",role:"admin",status:"active",name:"Admin",email:"admin@example.com"},
  {id:"pending",memberId:null,role:"member",status:"pending",name:null,email:"pending@example.com"},
  {id:"inactive",memberId:"revoked",role:"member",status:"inactive",name:null,email:"old@example.com"},
];
test("Mine uses login identity, never workspace owner or membership row ID; Unread uses row count",()=>{
 const row={contact:{assignedTo:"support"},unreadCount:2};
 assert.equal(belongsInInboxTab("all",row,"owner-a"),true);
 assert.equal(belongsInInboxTab("mine",row,"support"),true);
 assert.equal(belongsInInboxTab("mine",row,"support-row"),false);
 assert.equal(belongsInInboxTab("mine",row,"owner-a"),false);
 assert.equal(belongsInInboxTab("mine",{contact:{},unreadCount:0},undefined),false);
 assert.equal(belongsInInboxTab("unread",row,"support"),true);
 assert.equal(belongsInInboxTab("unread",{...row,unreadCount:0},"support"),false);
});
test("empty filters cannot claim the workspace has no connected channels",()=>{
 for(const hasAnyChannel of [true,false,undefined]) {
   assert.equal(inboxEmptyKind({tab:"mine",searching:false,channelFiltered:false,rawCount:0,hasAnyChannel}),"mine");
   assert.equal(inboxEmptyKind({tab:"unread",searching:false,channelFiltered:false,rawCount:0,hasAnyChannel}),"unread");
 }
 assert.equal(inboxEmptyKind({tab:"all",searching:false,channelFiltered:false,rawCount:0,hasAnyChannel:false}),"noChannels");
 assert.equal(inboxEmptyKind({tab:"all",searching:false,channelFiltered:false,rawCount:1,hasAnyChannel:false}),"empty");
 assert.equal(inboxEmptyKind({tab:"mine",searching:true,channelFiltered:false,rawCount:1}),"filtered");
 assert.equal(inboxEmptyKind({tab:"all",searching:false,channelFiltered:true,rawCount:1,hasAnyChannel:false}),"filtered");
});
test("assignment choices match server owner/admin/reassignment and member claim/release rules",()=>{
 for(const actor of ["owner-a","admin"]) for(const next of ["support","admin","owner-a",null]) assert.equal(canAssignConversation(actor,members,"support",next),true);
 assert.equal(canAssignConversation("support",members,null,"support"),true);
 assert.equal(canAssignConversation("support",members,"support",null),true);
 assert.equal(canAssignConversation("support",members,"admin","support"),false);
 assert.equal(canAssignConversation("support",members,null,"admin"),false);
 for(const target of ["pending","revoked","outsider"]) assert.equal(canAssignConversation("owner-a",members,null,target),false);
 assert.equal(canAssignConversation("outsider",members,null,null),false);
});
test("reply identity only names proven senders and never guesses from assignment or owner",()=>{
 const sender={id:"support",name:"Support",avatarUrl:null};
 assert.deepEqual(replyIdentity({sentByUserId:"support",sender}).sender,sender);
 assert.equal(replyIdentity({generatedBy:"human"}).kind,"unknown");
 assert.equal(replyIdentity({sentByUserId:"support",sender:{...sender,id:"owner-a"}}).kind,"unknown");
 assert.equal(replyIdentity({generatedBy:"ai_brain",sentByUserId:"support",sender}).kind,"ai");
 for(const generatedBy of ["chatbot","workflow","campaign","auto_reply","approved_asset"]) assert.equal(replyIdentity({generatedBy,sender,sentByUserId:"support"}).kind,"automation");
 assert.equal(replyIdentity({generatedBy:"unrecognized-import"}).kind,"unknown");
 assert.equal(replyIdentity({}).sender,null);
});
