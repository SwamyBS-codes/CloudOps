/**
 * EC2 Service - AWS EC2 Instance Management
 * Handles EC2 operations: list, create, start, stop, terminate instances
 * Uses AWS SDK v3
 */

const {
  EC2Client,
  DescribeInstancesCommand,
  DescribeSubnetsCommand,
  RunInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
  DescribeInstanceStatusCommand,
  GetConsoleOutputCommand,
  DescribeSecurityGroupsCommand,
  CreateKeyPairCommand,
  DescribeKeyPairsCommand,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  DescribeVpcsCommand,
} = require('@aws-sdk/client-ec2');
const {
  SSMClient,
  GetParameterCommand,
} = require('@aws-sdk/client-ssm');

// Configure EC2 Client
const ec2Client = new EC2Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const ssmClient = new SSMClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

class EC2Service {
  /**
   * List all EC2 instances
   * @param {Object} filters - Optional filters for instance state
   * @returns {Promise<Array>} Array of instance details
   */
  async listInstances(filters = []) {
    try {
      const params = {
        Filters: [
          {
            Name: 'instance-state-name',
            Values: ['running', 'stopped', 'pending'],
          },
          ...filters,
        ],
      };

      const command = new DescribeInstancesCommand(params);
      const response = await ec2Client.send(command);

      return (response.Reservations || []).flatMap((reservation) =>
        (reservation.Instances || []).map((instance) => ({
          instanceId: instance.InstanceId,
          instanceType: instance.InstanceType,
          state: instance.State.Name,
          launchTime: instance.LaunchTime,
          publicIp: instance.PublicIpAddress || null,
          privateIp: instance.PrivateIpAddress,
          keyName: instance.KeyName,
          securityGroups: (instance.SecurityGroups || []).map((sg) => ({
            id: sg.GroupId,
            name: sg.GroupName,
          })),
          tags: instance.Tags ? this._tagsToObject(instance.Tags) : {},
          vpcId: instance.VpcId,
          subnetId: instance.SubnetId,
          imageId: instance.ImageId,
          architecture: instance.Architecture,
        }))
      );
    } catch (error) {
      throw new Error(`Failed to list EC2 instances: ${error.message}`);
    }
  }

  /**
   * Describe specific EC2 instances by IDs
   * @param {Array<string>} instanceIds - Array of EC2 Instance IDs
   * @returns {Promise<Array>} Array of instance details
   */
  async describeInstances(instanceIds) {
    try {
      const params = {
        InstanceIds: instanceIds,
      };

      const command = new DescribeInstancesCommand(params);
      const response = await ec2Client.send(command);

      return (response.Reservations || []).flatMap((reservation) =>
        (reservation.Instances || []).map((instance) => ({
          instanceId: instance.InstanceId,
          instanceType: instance.InstanceType,
          state: instance.State.Name,
          launchTime: instance.LaunchTime,
          publicIp: instance.PublicIpAddress || null,
          privateIp: instance.PrivateIpAddress,
          keyName: instance.KeyName,
          securityGroups: (instance.SecurityGroups || []).map((sg) => ({
            id: sg.GroupId,
            name: sg.GroupName,
          })),
          tags: instance.Tags ? this._tagsToObject(instance.Tags) : {},
          vpcId: instance.VpcId,
          subnetId: instance.SubnetId,
          imageId: instance.ImageId,
          architecture: instance.Architecture,
        }))
      );
    } catch (error) {
      throw new Error(`Failed to describe EC2 instances: ${error.message}`);
    }
  }

  /**
   * Find a public subnet ID to launch instances into
   * @param {string} [vpcId] - Optional VPC ID to filter subnets
   * @returns {Promise<string|null>} Subnet ID or null
   */
  async findPublicSubnetId(vpcId) {
    try {
      const filters = [
        {
          Name: 'map-public-ip-on-launch',
          Values: ['true'],
        },
      ];

      if (vpcId) {
        filters.unshift({
          Name: 'vpc-id',
          Values: [vpcId],
        });
      }

      const defaultSubnetCommand = new DescribeSubnetsCommand({
        Filters: [
          ...filters,
          {
            Name: 'default-for-az',
            Values: ['true'],
          },
        ],
      });

      const defaultResponse = await ec2Client.send(defaultSubnetCommand);
      if (defaultResponse.Subnets && defaultResponse.Subnets.length > 0) {
        return defaultResponse.Subnets[0].SubnetId;
      }

      const subnetCommand = new DescribeSubnetsCommand({
        Filters: filters,
      });

      const subnetResponse = await ec2Client.send(subnetCommand);
      if (subnetResponse.Subnets && subnetResponse.Subnets.length > 0) {
        return subnetResponse.Subnets[0].SubnetId;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get a single instance by ID
   * @param {string} instanceId - EC2 Instance ID
   * @returns {Promise<Object>} Instance details
   */
  async getInstance(instanceId) {
    try {
      const params = {
        InstanceIds: [instanceId],
      };

      const command = new DescribeInstancesCommand(params);
      const response = await ec2Client.send(command);

      if (!response.Reservations.length || !response.Reservations[0].Instances.length) {
        throw new Error('Instance not found');
      }

      const instance = response.Reservations[0].Instances[0];

      return {
        instanceId: instance.InstanceId,
        instanceType: instance.InstanceType,
        state: instance.State.Name,
        launchTime: instance.LaunchTime,
        publicIp: instance.PublicIpAddress || null,
        privateIp: instance.PrivateIpAddress,
        keyName: instance.KeyName,
        securityGroups: instance.SecurityGroups.map((sg) => ({
          id: sg.GroupId,
          name: sg.GroupName,
        })),
        tags: instance.Tags ? this._tagsToObject(instance.Tags) : {},
        vpcId: instance.VpcId,
        subnetId: instance.SubnetId,
        imageId: instance.ImageId,
        cpuDetails: instance.CpuOptions,
        monitoring: instance.Monitoring?.State,
      };
    } catch (error) {
      throw new Error(`Failed to get instance ${instanceId}: ${error.message}`);
    }
  }

  async getLatestAmazonLinux2Ami() {
    try {
      const command = new GetParameterCommand({
        Name: '/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2',
      });
      const response = await ssmClient.send(command);

      if (!response.Parameter || !response.Parameter.Value) {
        throw new Error('Amazon Linux 2 AMI parameter not found');
      }

      return response.Parameter.Value;
    } catch (error) {
      throw new Error(`Failed to retrieve latest Amazon Linux 2 AMI: ${error.message}`);
    }
  }

  /**
   * Create a new EC2 instance
   * @param {Object} config - Instance configuration
   * @returns {Promise<Object>} Created instance details
   */
  async createInstance(config) {
    try {
      let {
        amiId,
        instanceType,
        keyName,
        securityGroupIds,
        minCount = 1,
        maxCount = 1,
        subnetId = undefined,
        tagName = 'CloudOps-Instance',
        tagEnvironment = 'development',
        userData = undefined,
        deploymentId = undefined,
      } = config;

      if (!amiId) {
        amiId = await this.getLatestAmazonLinux2Ami();
      }

      // Validate required parameters
      if (!amiId || !instanceType) {
        throw new Error('AMI ID and instance type are required');
      }

      const targetSubnetId = subnetId || await this.findPublicSubnetId();

      const params = {
        ImageId: amiId,
        InstanceType: instanceType,
        MinCount: minCount,
        MaxCount: maxCount,
        KeyName: keyName,
      };

      if (targetSubnetId) {
        params.NetworkInterfaces = [
          {
            DeviceIndex: 0,
            SubnetId: targetSubnetId,
            AssociatePublicIpAddress: true,
            Groups: securityGroupIds || [],
            DeleteOnTermination: true,
          },
        ];
      } else {
        params.SecurityGroupIds = securityGroupIds || [];
      }

      if (userData) {
        params.UserData = Buffer.from(userData).toString('base64');
      }

      // Add tags
      const tags = [
        {
          Key: 'Name',
          Value: tagName,
        },
        {
          Key: 'Environment',
          Value: tagEnvironment,
        },
        {
          Key: 'CreatedBy',
          Value: 'CloudOps',
        },
        {
          Key: 'CreatedAt',
          Value: new Date().toISOString(),
        },
      ];

      if (deploymentId) {
        tags.push({
          Key: 'DeploymentId',
          Value: deploymentId,
        });
      }

      params.TagSpecifications = [
        {
          ResourceType: 'instance',
          Tags: tags,
        },
      ];

      const command = new RunInstancesCommand(params);
      const response = await ec2Client.send(command);

      const instance = response.Instances[0];

      return {
        instanceId: instance.InstanceId,
        instanceType: instance.InstanceType,
        state: instance.State.Name,
        publicIp: instance.PublicIpAddress || null,
        privateIp: instance.PrivateIpAddress,
        imageId: instance.ImageId,
        launchTime: instance.LaunchTime,
        tags: instance.Tags ? this._tagsToObject(instance.Tags) : {},
        message: 'Instance creation initiated',
      };
    } catch (error) {
      throw new Error(`Failed to create EC2 instance: ${error.message}`);
    }
  }

  /**
   * Start a stopped EC2 instance
   * @param {string} instanceId - EC2 Instance ID
   * @returns {Promise<Object>} Updated instance state
   */
  async startInstance(instanceId) {
    try {
      const params = {
        InstanceIds: [instanceId],
      };

      const command = new StartInstancesCommand(params);
      const response = await ec2Client.send(command);

      const instance = response.StartingInstances[0];

      return {
        instanceId: instance.InstanceId,
        previousState: instance.PreviousState.Name,
        currentState: instance.CurrentState.Name,
        message: 'Instance start command sent',
      };
    } catch (error) {
      throw new Error(`Failed to start instance ${instanceId}: ${error.message}`);
    }
  }

  /**
   * Stop a running EC2 instance
   * @param {string} instanceId - EC2 Instance ID
   * @returns {Promise<Object>} Updated instance state
   */
  async stopInstance(instanceId) {
    try {
      const params = {
        InstanceIds: [instanceId],
      };

      const command = new StopInstancesCommand(params);
      const response = await ec2Client.send(command);

      const instance = response.StoppingInstances[0];

      return {
        instanceId: instance.InstanceId,
        previousState: instance.PreviousState.Name,
        currentState: instance.CurrentState.Name,
        message: 'Instance stop command sent',
      };
    } catch (error) {
      throw new Error(`Failed to stop instance ${instanceId}: ${error.message}`);
    }
  }

  /**
   * Terminate an EC2 instance
   * @param {string} instanceId - EC2 Instance ID
   * @returns {Promise<Object>} Termination details
   */
  async terminateInstance(instanceId) {
    try {
      const params = {
        InstanceIds: [instanceId],
      };

      const command = new TerminateInstancesCommand(params);
      const response = await ec2Client.send(command);

      const instance = response.TerminatingInstances[0];

      return {
        instanceId: instance.InstanceId,
        previousState: instance.PreviousState.Name,
        currentState: instance.CurrentState.Name,
        message: 'Instance termination initiated',
      };
    } catch (error) {
      throw new Error(`Failed to terminate instance ${instanceId}: ${error.message}`);
    }
  }

  /**
   * Get instance public IP
   * @param {string} instanceId - EC2 Instance ID
   * @returns {Promise<string>} Public IP address
   */
  async getPublicIp(instanceId) {
    try {
      const instance = await this.getInstance(instanceId);

      if (!instance.publicIp) {
        throw new Error('Instance does not have a public IP assigned');
      }

      return instance.publicIp;
    } catch (error) {
      throw new Error(`Failed to get public IP for instance ${instanceId}: ${error.message}`);
    }
  }

  /**
   * Get instance status
   * @param {string} instanceId - EC2 Instance ID
   * @returns {Promise<Object>} Instance status details
   */
  async getInstanceStatus(instanceId) {
    try {
      const params = {
        InstanceIds: [instanceId],
      };

      const command = new DescribeInstanceStatusCommand(params);
      const response = await ec2Client.send(command);

      if (!response.InstanceStatuses.length) {
        throw new Error('Instance status not found');
      }

      const status = response.InstanceStatuses[0];

      return {
        instanceId: status.InstanceId,
        instanceState: status.InstanceState.Name,
        systemStatus: status.SystemStatus?.Status || 'unknown',
        instanceStatus: status.InstanceStatus?.Status || 'unknown',
        availabilityZone: status.AvailabilityZone,
      };
    } catch (error) {
      throw new Error(`Failed to get instance status for ${instanceId}: ${error.message}`);
    }
  }

  /**
   * Get instance system/application console output
   * @param {string} instanceId
   * @returns {Promise<string>}
   */
  async getConsoleOutput(instanceId) {
    try {
      const command = new GetConsoleOutputCommand({
        InstanceId: instanceId,
      });
      const response = await ec2Client.send(command);
      if (response.Output) {
        return Buffer.from(response.Output, 'base64').toString('utf8');
      }
      return '';
    } catch (error) {
      return `[AWS EC2 Log Notice] Console output not available: ${error.message}`;
    }
  }

  /**
   * List security groups
   * @returns {Promise<Array>} Array of security groups
   */
  async listSecurityGroups() {
    try {
      const command = new DescribeSecurityGroupsCommand({});
      const response = await ec2Client.send(command);

      return response.SecurityGroups.map((sg) => ({
        groupId: sg.GroupId,
        groupName: sg.GroupName,
        description: sg.Description,
        vpcId: sg.VpcId,
        inboundRules: sg.IpPermissions.length,
        outboundRules: sg.IpPermissionsEgress.length,
      }));
    } catch (error) {
      throw new Error(`Failed to list security groups: ${error.message}`);
    }
  }

  /**
   * Create or get EC2 key pair
   * @param {string} keyName - Name for the key pair
   * @returns {Promise<Object>} Key pair details { keyName, created: boolean, privateKey?: string }
   */
  async createOrGetKeyPair(keyName) {
    try {
      // Check if key pair already exists
      const listCommand = new DescribeKeyPairsCommand({
        KeyNames: [keyName],
      });

      try {
        const listResponse = await ec2Client.send(listCommand);
        if (listResponse.KeyPairs && listResponse.KeyPairs.length > 0) {
          return {
            keyName,
            created: false,
            message: 'Key pair already exists',
          };
        }
      } catch (error) {
        // Check for various AWS error messages indicating key pair doesn't exist
        if (error.message.includes('InvalidKeyPair.NotFound') ||
            error.message.includes('does not exist') ||
            error.name === 'InvalidKeyPair.NotFoundException') {
          // Key pair doesn't exist, so we'll create it
        } else {
          throw error;
        }
      }

      // Create new key pair
      const createCommand = new CreateKeyPairCommand({
        KeyName: keyName,
        KeyType: 'rsa',
        KeyFormat: 'pem',
        TagSpecifications: [
          {
            ResourceType: 'key-pair',
            Tags: [
              {
                Key: 'Name',
                Value: `cloudops-${keyName}`,
              },
              {
                Key: 'ManagedBy',
                Value: 'CloudOps',
              },
            ],
          },
        ],
      });

      const response = await ec2Client.send(createCommand);

      return {
        keyName: response.KeyName,
        created: true,
        privateKey: response.PrivateKey,
        keyFingerprint: response.KeyFingerprint,
        message: 'Key pair created successfully',
      };
    } catch (error) {
      throw new Error(`Failed to create/get key pair: ${error.message}`);
    }
  }

  /**
   * Create or get security group for CloudOps deployments
   * @param {string} groupName - Name for the security group
   * @param {string} description - Description for the security group
   * @param {string} vpcId - Optional VPC ID
   * @returns {Promise<Object>} Security group details { groupId, groupName, created: boolean }
   */
  async createOrGetSecurityGroup(groupName, description, vpcId = null) {
    try {
      // List existing security groups
      const listCommand = new DescribeSecurityGroupsCommand({
        Filters: [
          {
            Name: 'group-name',
            Values: [groupName],
          },
        ],
      });

      const listResponse = await ec2Client.send(listCommand);

      if (listResponse.SecurityGroups && listResponse.SecurityGroups.length > 0) {
        const sg = listResponse.SecurityGroups[0];
        return {
          groupId: sg.GroupId,
          groupName: sg.GroupName,
          created: false,
          message: 'Security group already exists',
        };
      }

      // Get default VPC if not provided
      let targetVpcId = vpcId;
      if (!targetVpcId) {
        const vpcsCommand = new DescribeVpcsCommand({
          Filters: [{ Name: 'isDefault', Values: ['true'] }],
        });
        const vpcsResponse = await ec2Client.send(vpcsCommand);
        if (vpcsResponse.Vpcs && vpcsResponse.Vpcs.length > 0) {
          targetVpcId = vpcsResponse.Vpcs[0].VpcId;
        }
      }

      // Create new security group
      const createCommand = new CreateSecurityGroupCommand({
        GroupName: groupName,
        Description: description,
        VpcId: targetVpcId,
        TagSpecifications: [
          {
            ResourceType: 'security-group',
            Tags: [
              {
                Key: 'Name',
                Value: `cloudops-${groupName}`,
              },
              {
                Key: 'ManagedBy',
                Value: 'CloudOps',
              },
            ],
          },
        ],
      });

      const createResponse = await ec2Client.send(createCommand);
      const groupId = createResponse.GroupId;

      // Add inbound rules for HTTP, HTTPS, and SSH
      const ingressRules = [
        {
          IpProtocol: 'tcp',
          FromPort: 80,
          ToPort: 80,
          IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'Allow HTTP' }],
        },
        {
          IpProtocol: 'tcp',
          FromPort: 443,
          ToPort: 443,
          IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'Allow HTTPS' }],
        },
        {
          IpProtocol: 'tcp',
          FromPort: 22,
          ToPort: 22,
          IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'Allow SSH' }],
        },
      ];

      for (const rule of ingressRules) {
        try {
          const ingressCommand = new AuthorizeSecurityGroupIngressCommand({
            GroupId: groupId,
            IpPermissions: [rule],
          });
          await ec2Client.send(ingressCommand);
        } catch (error) {
          // Skip if rule already exists
          if (!error.message.includes('InvalidPermission.Duplicate')) {
            throw error;
          }
        }
      }

      return {
        groupId,
        groupName,
        created: true,
        message: 'Security group created successfully with HTTP, HTTPS, and SSH access',
      };
    } catch (error) {
      throw new Error(`Failed to create/get security group: ${error.message}`);
    }
  }

  /**
   * Helper: Convert Tags array to object
   * @private
   */
  _tagsToObject(tags) {
    return (tags || []).reduce((tagObj, tag) => {
      tagObj[tag.Key] = tag.Value;
      return tagObj;
    }, {});
  }
}

module.exports = new EC2Service();
