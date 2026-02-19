// This would be a React component in a real build setup
// For now it's a placeholder that the UI slot system will load
export default {
  name: 'BitbucketPanel',
  slot: 'issue-detail-panel',
  render: (props: { issueKey: string }) => {
    return { type: 'bitbucket-panel', issueKey: props.issueKey };
  },
};
