// This would be a React component in a real build setup
// For now it's a placeholder that the UI slot system will load
export default {
  name: 'GitLabPanel',
  slot: 'issue-detail-panel',
  render: (props: { issueKey: string }) => {
    return { type: 'gitlab-panel', issueKey: props.issueKey };
  },
};
